import { getAgentProfile } from '@arguon/shared/db/agents.js';
import { getUserById } from '@arguon/shared/db/users.js';
import {
  getPostById,
  getCommentsByPost,
  insertComment,
  checkBudget,
  recordUsage,
  pauseProviderIfCapped,
  logBudgetAlert,
  insertDlqEntry,
  createLLMProvider,
  buildCommentPrompt,
  retrieveRelevantMemories,
  formatMemoryBlock,
  getActiveAgents,
  createNotification,
  upsertReaction,
} from '@arguon/shared';
import type { Comment, Reaction, ReactionType, RetrievalEnv, Notification } from '@arguon/shared';

export interface Env {
  DB: D1Database;
  MEMORY_INDEX: VectorizeIndex;
  AI: Ai;
  MEMORY_QUEUE: Queue;
  ANTHROPIC_API_KEY: string;
  GEMINI_API_KEY: string;
  GROQ_API_KEY: string;
}

interface CommentMessage {
  post_id: string;
  agent_id?: string;
}

const MAX_CONSECUTIVE_AI = 4;
const COOLDOWN_MS = 30 * 60_000; // 30 minutes

export async function shouldAgentComment(
  agentId: string,
  postId: string,
  commentProbability: number,
  db: D1Database,
  nowMs: number = Date.now(),
): Promise<boolean> {
  // Probability gate
  if (Math.random() >= commentProbability) return false;

  const comments = await getCommentsByPost(postId, db);
  if (comments.length === 0) return true;

  // Agent can't comment twice in a row
  const lastComment = comments[comments.length - 1];
  if (lastComment.user_id === agentId) return false;

  // Count consecutive AI comments at the end of the thread
  let consecutiveAi = 0;
  for (let i = comments.length - 1; i >= 0; i--) {
    if (comments[i].is_ai) {
      consecutiveAi++;
    } else {
      break;
    }
  }

  if (consecutiveAi >= MAX_CONSECUTIVE_AI) {
    // Check if cooldown has passed since last AI comment
    const lastAiComment = comments[comments.length - 1];
    const timeSince = nowMs - Date.parse(lastAiComment.created_at);
    if (timeSince < COOLDOWN_MS) return false;
  }

  return true;
}

const VALID_REACTIONS: ReactionType[] = ['agree', 'interesting', 'doubtful', 'insightful'];

function pickReactionByPersonality(agreementBias: number): ReactionType {
  const rand = Math.random();
  if (agreementBias > 0.3) return rand < 0.5 ? 'agree' : 'insightful';
  if (agreementBias < -0.3) return rand < 0.5 ? 'doubtful' : 'interesting';
  return VALID_REACTIONS[Math.floor(rand * VALID_REACTIONS.length)];
}

async function insertAgentReaction(
  agentId: string,
  postId: string,
  reactionType: ReactionType,
  db: D1Database,
): Promise<void> {
  const reaction: Reaction = {
    id: crypto.randomUUID(),
    user_id: agentId,
    target_type: 'post',
    target_id: postId,
    reaction_type: reactionType,
    created_at: new Date().toISOString(),
  };
  await upsertReaction(reaction, db);
}

async function generateComment(agentId: string, postId: string, env: Env): Promise<void> {
  const user = await getUserById(agentId, env.DB);
  if (!user) throw new Error(`Agent user ${agentId} not found`);

  const profile = await getAgentProfile(agentId, env.DB);
  if (!profile) throw new Error(`Agent profile ${agentId} not found`);

  const post = await getPostById(postId, env.DB);
  if (!post) throw new Error(`Post ${postId} not found`);

  const canComment = await shouldAgentComment(
    agentId,
    postId,
    profile.behavior.comment_probability,
    env.DB,
  );

  // Always react — even if the agent doesn't comment
  if (!canComment) {
    const reactionType = pickReactionByPersonality(profile.personality.agreement_bias);
    await insertAgentReaction(agentId, postId, reactionType, env.DB);
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  const { allowed } = await checkBudget(profile.provider_id, today, env.DB);
  if (!allowed) return;

  // Get post author info
  const postAuthor = await getUserById(post.agent_id, env.DB);
  const authorHandle = postAuthor?.handle ?? 'unknown';

  // Build thread context from existing comments
  const existingComments = await getCommentsByPost(postId, env.DB);
  const recentComments = existingComments.slice(-5);
  const threadContext = recentComments.length > 0
    ? (await Promise.all(
        recentComments.map(async (cmt) => {
          const cmtUser = await getUserById(cmt.user_id, env.DB);
          return `@${cmtUser?.handle ?? 'unknown'}: ${cmt.content}`;
        }),
      )).join('\n')
    : '(no comments yet)';

  // Retrieve relevant memories
  const contextText = `${post.headline}: ${post.summary}`;
  const retrievalEnv: RetrievalEnv = { DB: env.DB, MEMORY_INDEX: env.MEMORY_INDEX, AI: env.AI };
  const memories = await retrieveRelevantMemories(
    agentId,
    contextText,
    profile.behavior.memory_decay_lambda,
    profile.behavior.memory_context_limit,
    retrievalEnv,
  );
  const memoryBlock = formatMemoryBlock(memories);

  // Build prompt and call LLM
  const { system, user: userPrompt } = buildCommentPrompt(
    { name: user.name, handle: user.handle, bio: user.bio ?? '', profile },
    { headline: post.headline, summary: post.summary, authorHandle },
    threadContext,
    memoryBlock,
  );

  const llm = createLLMProvider(profile.provider_id, profile.model_id, {
    ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
    GEMINI_API_KEY: env.GEMINI_API_KEY,
    GROQ_API_KEY: env.GROQ_API_KEY,
  });
  const result = await llm.call({ system, user: userPrompt, maxTokens: 1024 });

  // Parse response
  const cleaned = result.text.replace(/```json\s*/g, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(cleaned) as { content: string; reaction_type?: string };

  if (!parsed.content || typeof parsed.content !== 'string' || parsed.content.length === 0) {
    throw new Error('LLM returned empty content');
  }

  // Insert reaction (from LLM or personality-based fallback)
  const reactionType: ReactionType = VALID_REACTIONS.includes(parsed.reaction_type as ReactionType)
    ? (parsed.reaction_type as ReactionType)
    : pickReactionByPersonality(profile.personality.agreement_bias);
  await insertAgentReaction(agentId, postId, reactionType, env.DB);

  // Truncate to 300 chars
  const content = parsed.content.slice(0, 300);

  const commentId = crypto.randomUUID();
  const now = new Date().toISOString();

  const comment: Comment = {
    id: commentId,
    post_id: postId,
    parent_comment_id: null,
    user_id: agentId,
    content,
    is_ai: 1,
    created_at: now,
  };

  await insertComment(comment, env.DB);

  // Notify post author about the AI comment (if the agent isn't the author)
  try {
    if (post.agent_id !== agentId) {
      const notif: Notification = {
        id: crypto.randomUUID(),
        user_id: post.agent_id,
        type: 'reply',
        actor_id: agentId,
        post_id: postId,
        comment_id: commentId,
        is_read: 0,
        created_at: now,
      };
      await createNotification(notif, env.DB);
    }
  } catch (err) {
    console.error('[comment] Notification creation failed:', err);
  }

  // Record usage
  const inputCost = result.inputTokens * 0.000003;
  const outputCost = result.outputTokens * 0.000015;
  await recordUsage(profile.provider_id, today, result.inputTokens + result.outputTokens, inputCost + outputCost, env.DB);
  await pauseProviderIfCapped(profile.provider_id, today, env.DB);
  await logBudgetAlert(profile.provider_id, today, env.DB);

  // Enqueue memory event
  await env.MEMORY_QUEUE.send({
    agent_id: agentId,
    event_type: 'commented',
    ref_type: 'comment',
    ref_id: commentId,
    content,
    topics: post.tags_json ? (JSON.parse(post.tags_json) as string[]) : [],
    initial_weight: 0.8,
  });
}

export default {
  async queue(
    batch: MessageBatch<CommentMessage>,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    for (const msg of batch.messages) {
      const { post_id, agent_id } = msg.body;

      if (agent_id) {
        // Single agent comment
        try {
          await generateComment(agent_id, post_id, env);
          msg.ack();
        } catch (err) {
          console.error(`[comment] Failed for agent ${agent_id} on post ${post_id}:`, err);
          try {
            await insertDlqEntry(
              {
                id: crypto.randomUUID(),
                queue_name: 'comment-queue',
                payload_json: JSON.stringify(msg.body),
                error: err instanceof Error ? err.message : String(err),
                failed_at: new Date().toISOString(),
                retry_count: 0,
              },
              env.DB,
            );
          } catch { /* DLQ best-effort */ }
          msg.ack();
        }
        continue;
      }

      // No agent_id: fan out to all agents with staggered delays
      try {
        const agents = await getActiveAgents(env.DB);
        for (const agent of agents) {
          // Skip if agent is the post author
          const post = await getPostById(post_id, env.DB);
          if (post && post.agent_id === agent.id) continue;

          try {
            await generateComment(agent.id, post_id, env);
          } catch (err) {
            console.error(`[comment] Failed for agent ${agent.name} on post ${post_id}:`, err);
          }
        }
        msg.ack();
      } catch (err) {
        console.error(`[comment] Fan-out failed for post ${post_id}:`, err);
        msg.ack();
      }
    }
  },
} satisfies ExportedHandler<Env, CommentMessage>;

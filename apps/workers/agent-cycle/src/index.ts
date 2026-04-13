import type { AgentProfile } from '@arguon/shared';
import {
  getActiveAgents,
  getRecentArticles,
  hasRecentlyPostedOnTopic,
  updateAgentLastWake,
} from '@arguon/shared';

export interface Env {
  DB: D1Database;
  GENERATION_QUEUE: Queue;
  COMMENT_QUEUE: Queue;
  MEMORY_QUEUE: Queue;
}

export function isAgentDueToWake(profile: AgentProfile): boolean {
  if (!profile.last_wake_at) return true;

  const minMs = profile.behavior.read_interval_min_minutes * 60_000;
  const maxMs = profile.behavior.read_interval_max_minutes * 60_000;
  const interval = minMs + Math.random() * (maxMs - minMs);
  const dueAt = Date.parse(profile.last_wake_at) + interval;

  return Date.now() >= dueAt;
}

export default {
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const agents = await getActiveAgents(env.DB);
    const now = new Date().toISOString();

    for (const agent of agents) {
      try {
        if (!isAgentDueToWake(agent.profile)) continue;

        const topicFilter = agent.profile.personality.preferred_topics[0] ?? undefined;
        const articles = await getRecentArticles(env.DB, {
          limit: agent.profile.behavior.articles_per_session,
          topic: topicFilter,
          excludeAgentPostedIds: [agent.id],
        });

        for (const article of articles) {
          const topics: string[] = article.topics_json
            ? (JSON.parse(article.topics_json) as string[])
            : [];

          if (topics.length > 0) {
            const alreadyPosted = await hasRecentlyPostedOnTopic(
              agent.id,
              topics[0],
              2,
              env.DB,
            );
            if (alreadyPosted) continue;
          }

          await env.GENERATION_QUEUE.send({
            type: 'post',
            agent_id: agent.id,
            article_id: article.id,
          });

          await env.MEMORY_QUEUE.send({
            agent_id: agent.id,
            event_type: 'read_article',
            ref_type: 'article',
            ref_id: article.id,
            content: article.title,
            topics,
            initial_weight: 0.3,
          });
        }

        await updateAgentLastWake(agent.id, now, env.DB);
      } catch (error) {
        console.error(`Agent cycle failed for ${agent.name}:`, error);
      }
    }
  },
} satisfies ExportedHandler<Env>;

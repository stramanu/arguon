import {
  getPostsForScoring,
  getPostSources,
  getRelatedPosts,
  updateConfidenceScore,
  getSourceReliabilityByDomains,
  getDecayedMemoryIds,
  deleteMemoryByIds,
  extractDomains,
  titleOverlap,
  agreementFactor,
  computeConfidenceScore,
} from '@arguon/shared';

export interface Env {
  DB: D1Database;
  MEMORY_INDEX: VectorizeIndex;
}

const HOURS_BACK = 24;
const CONFIDENCE_THRESHOLD = 90;
const WINDOW_HOURS = 2;
const SCORE_CHANGE_THRESHOLD = 1;
const DECAY_LAMBDA = 0.05;
const WEIGHT_THRESHOLD = 0.01;
const AGE_DAYS = 90;

export async function recomputeScores(db: D1Database): Promise<number> {
  const posts = await getPostsForScoring(HOURS_BACK, CONFIDENCE_THRESHOLD, db);
  let updated = 0;

  for (const post of posts) {
    const sources = await getPostSources(post.id, db);
    const allDomains = extractDomains(sources.map((s) => s.url));

    const tags: string[] = post.tags_json ? JSON.parse(post.tags_json) : [];
    const related = await getRelatedPosts(post.id, tags, post.created_at, WINDOW_HOURS, db);

    // Collect all source domains across related posts
    const relatedSourcePromises = related.map((r) => getPostSources(r.id, db));
    const relatedSources = (await Promise.all(relatedSourcePromises)).flat();
    const combinedDomains = extractDomains([
      ...sources.map((s) => s.url),
      ...relatedSources.map((s) => s.url),
    ]);

    // Reliability average from news_sources table
    const reliabilities = await getSourceReliabilityByDomains(combinedDomains, db);
    const reliabilityAvg = reliabilities.length > 0
      ? reliabilities.reduce((a, b) => a + b, 0) / reliabilities.length
      : 0.5;

    // Agreement factor: max overlap between this post's sources and related posts' sources
    let maxOverlap = 0;
    const postTitles = sources.map((s) => s.title ?? '').filter(Boolean);
    const relatedTitles = relatedSources.map((s) => s.title ?? '').filter(Boolean);
    for (const pt of postTitles) {
      for (const rt of relatedTitles) {
        maxOverlap = Math.max(maxOverlap, titleOverlap(pt, rt));
      }
    }
    const agFactor = related.length > 0 ? agreementFactor(maxOverlap) : 0.4;

    // Cross-agent convergence
    const uniqueAgents = new Set(related.map((r) => r.agent_id));
    uniqueAgents.add(post.agent_id);
    const convergence = uniqueAgents.size >= 2 ? 0.05 : 0;

    const score = computeConfidenceScore({
      uniqueSourceDomains: allDomains.length,
      reliabilityAvg,
      agreementFactor: agFactor,
      convergence,
    });

    if (Math.abs(score - post.confidence_score) > SCORE_CHANGE_THRESHOLD) {
      await updateConfidenceScore(post.id, score, db);
      updated++;
    }
  }

  return updated;
}

export async function pruneMemories(
  db: D1Database,
  vectorIndex: VectorizeIndex,
): Promise<number> {
  const ids = await getDecayedMemoryIds(DECAY_LAMBDA, WEIGHT_THRESHOLD, AGE_DAYS, db);
  if (ids.length === 0) return 0;

  await vectorIndex.deleteByIds(ids);
  await deleteMemoryByIds(ids, db);
  return ids.length;
}

function isSunday(): boolean {
  return new Date().getUTCDay() === 0;
}

export default {
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    await recomputeScores(env.DB);

    if (isSunday()) {
      await pruneMemories(env.DB, env.MEMORY_INDEX);
    }
  },
} satisfies ExportedHandler<Env>;

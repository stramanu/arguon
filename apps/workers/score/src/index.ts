import {
  getPostsForScoring,
  getPostSources,
  getRelatedPosts,
  updateConfidenceScore,
  getSourceReliabilityByDomains,
  getCorroboratingArticles,
  getDecayedMemoryIds,
  deleteMemoryByIds,
  extractDomains,
  titleOverlap,
  agreementFactor,
  computeConfidenceScore,
  computeCoverageBonus,
  computeFreshnessDecay,
} from '@arguon/shared';

export interface Env {
  DB: D1Database;
  MEMORY_INDEX: VectorizeIndex;
}

const HOURS_BACK = 168;
const CONFIDENCE_THRESHOLD = 95;
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

    // Retroactive corroboration: articles from different sources on the same topics ingested after the post
    const originalSourceId = post.article_id
      ? (await db.prepare('SELECT source_id FROM raw_articles WHERE id = ?').bind(post.article_id).first<{ source_id: string }>())?.source_id ?? ''
      : '';
    const corroborating = originalSourceId
      ? await getCorroboratingArticles(originalSourceId, tags, post.created_at, db)
      : [];
    const corroboratingSourceIds = new Set(corroborating.map((c) => c.source_id));
    const corroboratingSourceCount = corroboratingSourceIds.size;

    const score = computeConfidenceScore({
      uniqueSourceDomains: allDomains.length,
      reliabilityAvg,
      agreementFactor: agFactor,
      convergence,
      corroboratingSourceCount,
    });

    if (Math.abs(score - post.confidence_score) > SCORE_CHANGE_THRESHOLD) {
      await updateConfidenceScore(post.id, score, db);
      updated++;
    }
  }

  return updated;
}

/** Update relevance_score on recent articles with cross-source coverage bonus. */
export async function updateArticleRelevance(db: D1Database): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const articles = await db
    .prepare(
      `SELECT id, source_id, topics_json, ingested_at, relevance_score
       FROM raw_articles WHERE ingested_at > ? ORDER BY ingested_at DESC LIMIT 200`,
    )
    .bind(cutoff)
    .all<{ id: string; source_id: string; topics_json: string | null; ingested_at: string; relevance_score: number }>();

  let updated = 0;
  for (const article of articles.results ?? []) {
    const tags: string[] = article.topics_json ? JSON.parse(article.topics_json) : [];
    if (tags.length === 0) continue;

    const corroborating = await getCorroboratingArticles(
      article.source_id,
      tags,
      article.ingested_at,
      db,
    );
    const uniqueSources = new Set(corroborating.map((c) => c.source_id));
    const coverageBonus = computeCoverageBonus(uniqueSources.size);

    const hoursOld = (Date.now() - Date.parse(article.ingested_at)) / 3_600_000;
    const freshnessDecay = computeFreshnessDecay(hoursOld);

    // Base relevance is stored; recalculate total with bonuses
    const baseRelevance = Math.min(article.relevance_score, 70); // cap at initial max
    const newScore = Math.round(Math.min(Math.max(baseRelevance + coverageBonus + freshnessDecay, 0), 100));

    if (Math.abs(newScore - article.relevance_score) >= 1) {
      await db
        .prepare('UPDATE raw_articles SET relevance_score = ? WHERE id = ?')
        .bind(newScore, article.id)
        .run();
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
    await updateArticleRelevance(env.DB);

    if (isSunday()) {
      await pruneMemories(env.DB, env.MEMORY_INDEX);
    }
  },
} satisfies ExportedHandler<Env>;

import type { NewsSource } from '../types/news.js';

export async function getActiveSources(db: D1Database): Promise<NewsSource[]> {
  const rows = await db
    .prepare('SELECT * FROM news_sources WHERE is_active = 1')
    .all<NewsSource>();
  return rows.results ?? [];
}

export async function upsertSource(source: NewsSource, db: D1Database): Promise<void> {
  await db
    .prepare(
      `INSERT INTO news_sources (id, name, url, type, language, reliability_score, is_active, consecutive_failures, topics_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         url = excluded.url,
         type = excluded.type,
         language = excluded.language,
         reliability_score = excluded.reliability_score,
         is_active = excluded.is_active`,
    )
    .bind(
      source.id,
      source.name,
      source.url,
      source.type,
      source.language,
      source.reliability_score,
      source.is_active,
      source.consecutive_failures,
      source.topics_json,
    )
    .run();
}

export async function incrementSourceFailures(sourceId: string, db: D1Database): Promise<void> {
  await db
    .prepare(
      `UPDATE news_sources
       SET consecutive_failures = consecutive_failures + 1,
           is_active = CASE WHEN consecutive_failures + 1 >= 3 THEN 0 ELSE is_active END
       WHERE id = ?`,
    )
    .bind(sourceId)
    .run();
}

/** Get reliability scores for sources whose URL matches any of the given domains. */
export async function getSourceReliabilityByDomains(
  domains: string[],
  db: D1Database,
): Promise<number[]> {
  if (domains.length === 0) return [];
  const likeConditions = domains.map(() => `url LIKE ?`).join(' OR ');
  const rows = await db
    .prepare(`SELECT reliability_score FROM news_sources WHERE ${likeConditions}`)
    .bind(...domains.map((d) => `%${d}%`))
    .all<{ reliability_score: number }>();
  return (rows.results ?? []).map((r) => r.reliability_score);
}

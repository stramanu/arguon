import type { RawArticle } from '../types/news.js';

export async function insertArticle(article: RawArticle, db: D1Database): Promise<void> {
  await db
    .prepare(
      `INSERT INTO raw_articles (id, source_id, url, title, content, published_at, hash, topics_json, region, language, ingested_at, relevance_score)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      article.id,
      article.source_id,
      article.url,
      article.title,
      article.content,
      article.published_at,
      article.hash,
      article.topics_json,
      article.region,
      article.language,
      article.ingested_at,
      article.relevance_score,
    )
    .run();
}

export async function articleExistsByHash(hash: string, db: D1Database): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 FROM raw_articles WHERE hash = ?')
    .bind(hash)
    .first<{ '1': number }>();
  return row !== null;
}

/** Find articles from different sources that cover similar topics, ingested after a given date. */
export async function getCorroboratingArticles(
  originalSourceId: string,
  tags: string[],
  afterDate: string,
  db: D1Database,
  limit = 20,
): Promise<{ source_id: string; title: string; url: string }[]> {
  if (tags.length === 0) return [];
  const likeConditions = tags.map(() => `topics_json LIKE ?`).join(' OR ');
  const rows = await db
    .prepare(
      `SELECT DISTINCT source_id, title, url FROM raw_articles
       WHERE source_id != ? AND ingested_at > ? AND (${likeConditions})
       ORDER BY ingested_at ASC LIMIT ?`,
    )
    .bind(originalSourceId, afterDate, ...tags.map((t) => `%${t}%`), limit)
    .all<{ source_id: string; title: string; url: string }>();
  return rows.results ?? [];
}

export async function getRecentArticles(
  db: D1Database,
  options: {
    limit?: number;
    topic?: string;
    language?: string;
    excludeAgentPostedIds?: string[];
    excludeAllPosted?: boolean;
  } = {},
): Promise<RawArticle[]> {
  const limit = options.limit ?? 20;
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (options.topic) {
    conditions.push("topics_json LIKE ?");
    values.push(`%${options.topic}%`);
  }

  if (options.language) {
    conditions.push('language = ?');
    values.push(options.language);
  }

  if (options.excludeAllPosted) {
    conditions.push(
      'id NOT IN (SELECT article_id FROM posts WHERE article_id IS NOT NULL)',
    );
  } else if (options.excludeAgentPostedIds && options.excludeAgentPostedIds.length > 0) {
    const placeholders = options.excludeAgentPostedIds.map(() => '?').join(', ');
    conditions.push(
      `id NOT IN (SELECT article_id FROM posts WHERE agent_id IN (${placeholders}) AND article_id IS NOT NULL)`,
    );
    values.push(...options.excludeAgentPostedIds);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  values.push(limit);

  const rows = await db
    .prepare(`SELECT * FROM raw_articles ${where} ORDER BY relevance_score DESC, ingested_at DESC LIMIT ?`)
    .bind(...values)
    .all<RawArticle>();
  return rows.results ?? [];
}

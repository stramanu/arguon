import type { RawArticle } from '../types/news.js';

export async function insertArticle(article: RawArticle, db: D1Database): Promise<void> {
  await db
    .prepare(
      `INSERT INTO raw_articles (id, source_id, url, title, content, published_at, hash, topics_json, region, language, ingested_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

export async function getRecentArticles(
  db: D1Database,
  options: {
    limit?: number;
    topic?: string;
    language?: string;
    excludeAgentPostedIds?: string[];
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

  if (options.excludeAgentPostedIds && options.excludeAgentPostedIds.length > 0) {
    const placeholders = options.excludeAgentPostedIds.map(() => '?').join(', ');
    conditions.push(
      `id NOT IN (SELECT article_id FROM posts WHERE agent_id IN (${placeholders}) AND article_id IS NOT NULL)`,
    );
    values.push(...options.excludeAgentPostedIds);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  values.push(limit);

  const rows = await db
    .prepare(`SELECT * FROM raw_articles ${where} ORDER BY ingested_at DESC LIMIT ?`)
    .bind(...values)
    .all<RawArticle>();
  return rows.results ?? [];
}

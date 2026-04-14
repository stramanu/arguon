import {
  getActiveSources,
  insertArticle,
  articleExistsByHash,
  incrementSourceFailures,
} from '@arguon/shared';
import type { NewsSource } from '@arguon/shared';
import { parseRssFeed } from './rss-parser.js';
import { fetchGuardian, fetchNYT, fetchNewsAPI } from './rest-adapters.js';
import { hashUrl, normalizeArticle } from './normalizer.js';
import type { FetchedArticle } from './types.js';

export interface Env {
  DB: D1Database;
  GUARDIAN_API_KEY: string;
  NYT_API_KEY: string;
  NEWSAPI_KEY: string;
}

async function fetchArticlesForSource(
  source: NewsSource,
  env: Env,
): Promise<FetchedArticle[]> {
  if (source.type === 'rss') {
    return parseRssFeed(source.url);
  }

  if (source.url.includes('guardianapis.com')) {
    return fetchGuardian(source.url, env.GUARDIAN_API_KEY);
  }
  if (source.url.includes('nytimes.com')) {
    return fetchNYT(source.url, env.NYT_API_KEY);
  }
  if (source.url.includes('newsapi.org')) {
    return fetchNewsAPI(source.url, env.NEWSAPI_KEY);
  }

  throw new Error(`Unknown REST source: ${source.name} (${source.url})`);
}

async function ingestSource(source: NewsSource, env: Env): Promise<number> {
  const items = await fetchArticlesForSource(source, env);
  let inserted = 0;

  for (const item of items) {
    const hash = await hashUrl(item.url);
    const exists = await articleExistsByHash(hash, env.DB);
    if (exists) continue;

    const article = normalizeArticle(item, source, hash);
    await insertArticle(article, env.DB);
    inserted++;
  }

  return inserted;
}

export default {
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const sources = await getActiveSources(env.DB);

    const results = await Promise.allSettled(
      sources.map(async (source) => {
        try {
          const count = await ingestSource(source, env);

          if (source.consecutive_failures > 0) {
            await env.DB
              .prepare('UPDATE news_sources SET consecutive_failures = 0 WHERE id = ?')
              .bind(source.id)
              .run();
          }

          return { sourceId: source.id, inserted: count };
        } catch (error) {
          await incrementSourceFailures(source.id, env.DB);
          console.error(`Ingestion failed for ${source.name}:`, error);
          throw error;
        }
      }),
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;
    console.log(`Ingestion complete: ${succeeded} sources succeeded, ${failed} failed`);
  },
} satisfies ExportedHandler<Env>;

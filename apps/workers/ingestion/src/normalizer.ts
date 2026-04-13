import type { RawArticle, NewsSource } from '@arguon/shared';
import type { FetchedArticle } from './types.js';
import { tagTopics } from './topic-tagger.js';
import { detectRegion } from './region-detector.js';

export async function hashUrl(url: string): Promise<string> {
  const encoded = new TextEncoder().encode(url);
  const buffer = await crypto.subtle.digest('SHA-256', encoded);
  const array = new Uint8Array(buffer);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function normalizeArticle(
  item: FetchedArticle,
  source: NewsSource,
  hash: string,
): RawArticle {
  const topics = tagTopics(item.title, item.content);
  const region = detectRegion(item.title);

  return {
    id: crypto.randomUUID(),
    source_id: source.id,
    url: item.url,
    title: item.title,
    content: item.content,
    published_at: item.publishedAt,
    hash,
    topics_json: topics.length > 0 ? JSON.stringify(topics) : null,
    region,
    language: source.language,
    ingested_at: new Date().toISOString(),
  };
}

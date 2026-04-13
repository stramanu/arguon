import type { FetchedArticle } from './types.js';

export async function parseRssFeed(feedUrl: string): Promise<FetchedArticle[]> {
  const response = await fetch(feedUrl, {
    headers: { 'User-Agent': 'Arguon/1.0 (News Aggregator)' },
  });

  if (!response.ok) {
    throw new Error(`RSS fetch failed: ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();
  return extractItems(xml);
}

export function extractItems(xml: string): FetchedArticle[] {
  const items: FetchedArticle[] = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];
    const title = extractTag(itemXml, 'title');
    const url = extractTag(itemXml, 'link') ?? extractTag(itemXml, 'guid');

    if (!title || !url) continue;

    const content =
      extractTag(itemXml, 'description') ?? extractTag(itemXml, 'content:encoded');
    const pubDate = extractTag(itemXml, 'pubDate') ?? extractTag(itemXml, 'dc:date');

    items.push({
      title: stripHtml(title),
      url: url.trim(),
      content: content ? stripHtml(content) : null,
      publishedAt: pubDate ? new Date(pubDate).toISOString() : null,
    });
  }

  return items;
}

function extractTag(xml: string, tagName: string): string | null {
  const cdataRegex = new RegExp(
    `<${tagName}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tagName}>`,
    'i',
  );
  const cdataMatch = cdataRegex.exec(xml);
  if (cdataMatch) return cdataMatch[1].trim();

  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, 'i');
  const match = regex.exec(xml);
  return match ? match[1].trim() : null;
}

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

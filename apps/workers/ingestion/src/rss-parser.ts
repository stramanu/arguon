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
  // Try RSS <item> first, then Atom <entry>
  const rssItems = extractRssItems(xml);
  if (rssItems.length > 0) return rssItems;
  return extractAtomEntries(xml);
}

function extractRssItems(xml: string): FetchedArticle[] {
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

function extractAtomEntries(xml: string): FetchedArticle[] {
  const items: FetchedArticle[] = [];
  const entryRegex = /<entry[^>]*>([\s\S]*?)<\/entry>/gi;
  let match: RegExpExecArray | null;

  while ((match = entryRegex.exec(xml)) !== null) {
    const entryXml = match[1];
    const title = extractTag(entryXml, 'title');
    const url = extractAtomLink(entryXml);

    if (!title || !url) continue;

    const content =
      extractTag(entryXml, 'summary') ?? extractTag(entryXml, 'content');
    const pubDate =
      extractTag(entryXml, 'published') ?? extractTag(entryXml, 'updated');

    items.push({
      title: stripHtml(title),
      url: url.trim(),
      content: content ? stripHtml(content) : null,
      publishedAt: pubDate ? new Date(pubDate).toISOString() : null,
    });
  }

  return items;
}

function extractAtomLink(xml: string): string | null {
  // Match <link rel="alternate" ... href="..."/> or <link href="..."/>
  const altRegex = /<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["'][^>]*\/?>/i;
  const altMatch = altRegex.exec(xml);
  if (altMatch) return altMatch[1];

  const hrefRegex = /<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i;
  const hrefMatch = hrefRegex.exec(xml);
  return hrefMatch ? hrefMatch[1] : null;
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

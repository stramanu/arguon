import type { FetchedArticle } from './types.js';

export async function fetchGuardian(
  baseUrl: string,
  apiKey: string,
): Promise<FetchedArticle[]> {
  const url = `${baseUrl}?api-key=${apiKey}&show-fields=trailText&page-size=20&order-by=newest`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Guardian API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    response: {
      results: Array<{
        webTitle: string;
        webUrl: string;
        fields?: { trailText?: string };
        webPublicationDate?: string;
      }>;
    };
  };

  return (data.response?.results ?? []).map((item) => ({
    title: item.webTitle,
    url: item.webUrl,
    content: item.fields?.trailText ?? null,
    publishedAt: item.webPublicationDate
      ? new Date(item.webPublicationDate).toISOString()
      : null,
  }));
}

export async function fetchNYT(
  baseUrl: string,
  apiKey: string,
): Promise<FetchedArticle[]> {
  const url = `${baseUrl}/home.json?api-key=${apiKey}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`NYT API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    results: Array<{
      title: string;
      url: string;
      abstract?: string;
      published_date?: string;
    }>;
  };

  return (data.results ?? []).map((item) => ({
    title: item.title,
    url: item.url,
    content: item.abstract ?? null,
    publishedAt: item.published_date
      ? new Date(item.published_date).toISOString()
      : null,
  }));
}

export async function fetchNewsAPI(
  baseUrl: string,
  apiKey: string,
): Promise<FetchedArticle[]> {
  const url = `${baseUrl}?apiKey=${apiKey}&pageSize=20&language=en`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`NewsAPI error: ${response.status}`);
  }

  const data = (await response.json()) as {
    articles: Array<{
      title: string | null;
      url: string | null;
      description?: string;
      publishedAt?: string;
    }>;
  };

  return (data.articles ?? [])
    .filter((a): a is typeof a & { title: string; url: string } => !!a.title && !!a.url)
    .map((item) => ({
      title: item.title,
      url: item.url,
      content: item.description ?? null,
      publishedAt: item.publishedAt
        ? new Date(item.publishedAt).toISOString()
        : null,
    }));
}

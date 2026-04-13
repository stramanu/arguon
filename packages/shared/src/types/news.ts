export interface NewsSource {
  id: string;
  name: string;
  url: string;
  type: 'rss' | 'rest';
  language: string;
  reliability_score: number;
  is_active: number;
  consecutive_failures: number;
  topics_json: string | null;
}

export interface RawArticle {
  id: string;
  source_id: string;
  url: string;
  title: string;
  content: string | null;
  published_at: string | null;
  hash: string;
  topics_json: string | null;
  region: string | null;
  language: string;
  ingested_at: string;
}

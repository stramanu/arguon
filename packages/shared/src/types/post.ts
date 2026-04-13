export interface Post {
  id: string;
  agent_id: string;
  article_id: string | null;
  headline: string;
  summary: string;
  confidence_score: number;
  tags_json: string | null;
  region: string | null;
  media_json: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface PostSource {
  post_id: string;
  url: string;
  title: string | null;
}

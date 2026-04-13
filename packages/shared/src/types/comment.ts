export interface Comment {
  id: string;
  post_id: string;
  parent_comment_id: string | null;
  user_id: string;
  content: string;
  is_ai: number;
  created_at: string;
}

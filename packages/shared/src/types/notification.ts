export type NotificationType = 'reply' | 'mention' | 'new_post';

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  actor_id: string;
  post_id: string;
  comment_id: string | null;
  is_read: number;
  created_at: string;
}

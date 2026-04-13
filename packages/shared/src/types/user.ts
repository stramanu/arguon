export interface User {
  id: string;
  clerk_user_id: string | null;
  handle: string;
  name: string;
  avatar_url: string | null;
  bio: string | null;
  is_ai: number;
  is_verified_ai: number;
  created_at: string;
}

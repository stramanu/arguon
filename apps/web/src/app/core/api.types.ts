export interface AgentPublic {
  id: string;
  handle: string;
  name: string;
  avatar_url: string | null;
  model_id: string | null;
  provider: string | null;
  is_verified_ai: boolean;
}

export interface ReactionCounts {
  agree: number;
  interesting: number;
  doubtful: number;
  insightful: number;
}

export type ReactionType = 'agree' | 'interesting' | 'doubtful' | 'insightful';

export interface PostPreview {
  id: string;
  headline: string;
  summary: string;
  confidence_score: number;
  confidence_label: string;
  confidence_color: string;
  tags: string[];
  region: string | null;
  created_at: string;
  agent: AgentPublic;
  reaction_counts: ReactionCounts;
  comment_count: number;
  user_reaction: ReactionType | null;
}

export interface PostSource {
  url: string;
  title: string | null;
}

export interface PostDetail {
  id: string;
  headline: string;
  summary: string;
  confidence_score: number;
  confidence_label: string;
  confidence_color: string;
  sources: PostSource[];
  tags: string[];
  region: string | null;
  created_at: string;
  updated_at: string | null;
  agent: (AgentPublic & { bio: string | null }) | null;
  reaction_counts: ReactionCounts;
  user_reaction: ReactionType | null;
  comment_count: number;
}

export interface CommentUser {
  id: string;
  handle: string;
  name: string;
  avatar_url: string | null;
  is_ai: boolean;
  is_verified_ai: boolean;
  model_id: string | null;
  provider: string | null;
}

export interface CommentItem {
  id: string;
  content: string;
  is_ai: boolean;
  created_at: string;
  user: CommentUser;
  reaction_counts: ReactionCounts;
  user_reaction: ReactionType | null;
  replies?: CommentItem[];
}

export type ReactionType = 'agree' | 'interesting' | 'doubtful' | 'insightful';
export type TargetType = 'post' | 'comment';

export interface Reaction {
  id: string;
  user_id: string;
  target_type: TargetType;
  target_id: string;
  reaction_type: ReactionType;
  created_at: string;
}

export interface ReactionCounts {
  agree: number;
  interesting: number;
  doubtful: number;
  insightful: number;
}

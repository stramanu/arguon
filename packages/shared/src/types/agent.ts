export interface AgentPersonality {
  traits: string[];
  editorial_stance: string;
  writing_style: string;
  preferred_topics: string[];
  avoided_topics: string[];
  comment_style: string;
  agreement_bias: number;
}

export interface AgentBehavior {
  post_frequency: 'high' | 'medium' | 'low';
  read_interval_min_minutes: number;
  read_interval_max_minutes: number;
  articles_per_session: number;
  comment_probability: number;
  memory_enabled: boolean;
  memory_decay_lambda: number;
  memory_context_limit: number;
}

/** D1 row shape for agent_profiles table */
export interface AgentProfileRow {
  user_id: string;
  provider_id: string;
  model_id: string;
  language: string;
  personality_json: string;
  behavior_json: string;
  last_wake_at: string | null;
  next_wake_at: string | null;
}

/** Parsed agent profile with typed JSON fields */
export interface AgentProfile {
  user_id: string;
  provider_id: string;
  model_id: string;
  language: string;
  personality: AgentPersonality;
  behavior: AgentBehavior;
  last_wake_at: string | null;
  next_wake_at: string | null;
}

export interface AgentModelHistory {
  id: string;
  agent_id: string;
  changed_at: string;
  from_model: string;
  to_model: string;
  reason: string;
}

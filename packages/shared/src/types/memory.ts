export type MemoryEventType = 'posted' | 'commented' | 'reacted' | 'read_article' | 'read_post';
export type MemoryRefType = 'post' | 'comment' | 'article';

/** D1 row shape for agent_memory table */
export interface AgentMemory {
  id: string;
  agent_id: string;
  event_type: MemoryEventType;
  ref_type: MemoryRefType;
  ref_id: string;
  summary: string;
  topics_json: string | null;
  initial_weight: number;
  created_at: string;
}

/** Queue message shape consumed by the Memory Worker */
export interface MemoryEvent {
  agent_id: string;
  event_type: MemoryEventType;
  ref_type: MemoryRefType;
  ref_id: string;
  content: string;
  topics: string[];
  initial_weight: number;
}

/** Memory item after RAG retrieval and decay computation */
export interface MemoryItem {
  id: string;
  event_type: MemoryEventType;
  summary: string;
  current_weight: number;
  cosine_similarity: number;
  created_at: string;
}

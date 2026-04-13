interface MemoryMessage {
  agent_id: string;
  event_type: string;
  ref_type: string;
  ref_id: string;
  summary: string;
  topics_json?: string;
}

export interface Env {
  DB: D1Database;
  MEMORY_INDEX: VectorizeIndex;
  AI: Ai;
  ANTHROPIC_API_KEY: string;
}

export default {
  async queue(
    _batch: MessageBatch<MemoryMessage>,
    _env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    // TODO: M5 — generate summary, create embedding, insert D1 + Vectorize
  },
} satisfies ExportedHandler<Env, MemoryMessage>;

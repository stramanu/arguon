export interface Env {
  DB: D1Database;
  MEMORY_INDEX: VectorizeIndex;
  AI: Ai;
  MEMORY_QUEUE: Queue;
  COMMENT_QUEUE: Queue;
  ANTHROPIC_API_KEY: string;
  GEMINI_API_KEY: string;
  GROQ_API_KEY: string;
  REPLICATE_API_KEY: string;
}

interface GenerationMessage {
  type?: 'post' | 'avatar';
  agent_id: string;
  article_id?: string;
}

export default {
  async queue(
    _batch: MessageBatch<GenerationMessage>,
    _env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    // TODO: M3 — handle avatar generation (type: "avatar")
    // TODO: M6 — handle post generation (type: "post" or default)
  },
} satisfies ExportedHandler<Env, GenerationMessage>;

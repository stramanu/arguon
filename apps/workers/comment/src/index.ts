export interface Env {
  DB: D1Database;
  MEMORY_INDEX: VectorizeIndex;
  AI: Ai;
  MEMORY_QUEUE: Queue;
  ANTHROPIC_API_KEY: string;
  GEMINI_API_KEY: string;
  GROQ_API_KEY: string;
}

interface CommentMessage {
  post_id: string;
  agent_id?: string;
}

export default {
  async queue(
    _batch: MessageBatch<CommentMessage>,
    _env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    // TODO: M8 — fetch post + thread, apply anti-loop, generate AI comment, insert
  },
} satisfies ExportedHandler<Env, CommentMessage>;

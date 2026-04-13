export interface Env {
  DB: D1Database;
  GENERATION_QUEUE: Queue;
  COMMENT_QUEUE: Queue;
  MEMORY_QUEUE: Queue;
}

export default {
  async scheduled(
    _controller: ScheduledController,
    _env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    // TODO: M6 — check which agents are due, read articles, enqueue generation tasks
    // TODO: M8 — comment cycle: find unseen posts, enqueue comment tasks
  },
} satisfies ExportedHandler<Env>;

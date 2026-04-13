export interface Env {
  DB: D1Database;
  MEMORY_INDEX: VectorizeIndex;
}

export default {
  async scheduled(
    _controller: ScheduledController,
    _env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    // TODO: M10 — recompute confidence scores for recent posts
    // TODO: M10 — weekly memory pruning (check day of week)
  },
} satisfies ExportedHandler<Env>;

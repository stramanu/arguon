export interface Env {
  DB: D1Database;
  GUARDIAN_API_KEY: string;
  NYT_API_KEY: string;
  NEWSAPI_KEY: string;
}

export default {
  async scheduled(
    _controller: ScheduledController,
    _env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    // TODO: M4 — fetch RSS + REST sources, normalize, deduplicate, insert to raw_articles
  },
} satisfies ExportedHandler<Env>;

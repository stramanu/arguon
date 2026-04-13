import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.test.toml' },
      miniflare: {
        d1Databases: ['DB'],
        bindings: {
          D1_MIGRATIONS: await readD1Migrations('../../../migrations'),
        },
      },
    }),
  ],
});

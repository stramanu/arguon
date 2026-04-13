/**
 * Seed script for Arguon D1 database.
 * Inserts providers, news sources, and initial daily budget rows.
 *
 * Usage:
 *   npx tsx scripts/seed.ts           # seeds remote D1
 *   npx tsx scripts/seed.ts --local   # seeds local D1
 */

const isLocal = process.argv.includes('--local');
const localFlag = isLocal ? '--local' : '';

async function exec(sql: string): Promise<void> {
  const { execSync } = await import('child_process');
  execSync(`wrangler d1 execute arguon-db ${localFlag} --command "${sql.replace(/"/g, '\\"')}"`, {
    stdio: 'inherit',
    cwd: process.cwd(),
  });
}

async function main(): Promise<void> {
  console.log('🌱 Seeding providers...');
  await exec(`
    INSERT OR IGNORE INTO providers (id, name, api_base, is_active, cost_per_input_token, cost_per_output_token) VALUES
      ('anthropic', 'Anthropic', 'https://api.anthropic.com', 1, 0.000003, 0.000015),
      ('google', 'Google', 'https://generativelanguage.googleapis.com', 1, 0.0000005, 0.0000015),
      ('groq', 'Groq', 'https://api.groq.com', 1, 0.0000001, 0.0000001);
  `);

  console.log('🌱 Seeding news sources...');
  await exec(`
    INSERT OR IGNORE INTO news_sources (id, name, url, type, language, reliability_score, is_active, consecutive_failures, topics_json) VALUES
      ('bbc', 'BBC News', 'http://feeds.bbc.co.uk/news/rss.xml', 'rss', 'en', 0.85, 1, 0, NULL),
      ('reuters', 'Reuters', 'http://www.reutersagency.com/feed', 'rss', 'en', 0.9, 1, 0, NULL),
      ('ap', 'Associated Press', 'https://apnews.com/apnewsapi', 'rss', 'en', 0.9, 1, 0, NULL),
      ('guardian', 'The Guardian', 'https://content.guardianapis.com/search', 'rest', 'en', 0.8, 1, 0, NULL),
      ('nyt', 'The New York Times', 'https://api.nytimes.com/svc/topstories/v2', 'rest', 'en', 0.85, 1, 0, NULL),
      ('newsapi', 'NewsAPI', 'https://newsapi.org/v2/top-headlines', 'rest', 'en', 0.6, 1, 0, NULL),
      ('aljazeera', 'Al Jazeera', 'https://www.aljazeera.com/xml/rss/all.xml', 'rss', 'en', 0.75, 1, 0, NULL),
      ('npr', 'NPR News', 'https://feeds.npr.org/1001/rss.xml', 'rss', 'en', 0.8, 1, 0, NULL);
  `);

  console.log('🌱 Seeding initial daily budget...');
  const today = new Date().toISOString().split('T')[0];
  await exec(`
    INSERT OR IGNORE INTO daily_budget (date, provider_id, tokens_used, cost_usd, cap_usd, is_paused) VALUES
      ('${today}', 'anthropic', 0, 0, 5.0, 0),
      ('${today}', 'google', 0, 0, 2.0, 0),
      ('${today}', 'groq', 0, 0, 1.0, 0);
  `);

  console.log('✅ Seed complete.');
}

main().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});

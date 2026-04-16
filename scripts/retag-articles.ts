/**
 * One-time script to re-tag all existing raw_articles using the updated topic tagger.
 * Run with: npx tsx scripts/retag-articles.ts
 *
 * Fetches articles from production D1 via wrangler, re-computes topics_json
 * with the word-boundary-aware tagger, and writes updates back in batches.
 */
import { execSync } from 'node:child_process';

// ── Inline tagger (mirrors apps/workers/ingestion/src/topic-tagger.ts) ──

const TOPIC_KEYWORDS: Record<string, string[]> = {
  technology: [
    'tech', 'software', 'robot', 'cyber',
    'digital', 'startup', 'silicon valley', 'gadget', 'app', 'algorithm',
    'data', 'cloud', 'chip', 'semiconductor', 'quantum', 'blockchain',
    'open source',
  ],
  ai: [
    'ai', 'artificial intelligence', 'machine learning', 'neural network',
    'openai', 'chatgpt', 'anthropic', 'claude', 'gemini ai', 'gpt', 'llm',
    'large language model', 'generative ai', 'deep learning', 'transformer',
    'diffusion model', 'midjourney', 'stable diffusion', 'copilot', 'qwen',
    'mistral', 'hugging face', 'foundation model', 'agi',
    'artificial general intelligence', 'deepseek',
  ],
  science: [
    'science', 'research', 'study', 'discovery', 'nasa', 'space', 'physics',
    'biology', 'chemistry', 'genome', 'experiment', 'telescope', 'molecule',
    'asteroid', 'mars', 'laboratory', 'peer-reviewed', 'hypothesis',
    'astrophysics', 'particle', 'cern',
  ],
  economy: [
    'economy', 'economic', 'market', 'stock', 'trade', 'inflation', 'gdp',
    'recession', 'bank', 'finance', 'tax', 'budget', 'debt', 'investment',
    'interest rate', 'fed', 'wall street', 'oil price', 'cryptocurrency',
    'central bank', 'supply chain', 'tariff',
  ],
  geopolitics: [
    'war', 'conflict', 'military', 'nato', 'diplomacy', 'sanctions', 'treaty',
    'border', 'missile', 'nuclear', 'alliance', 'united nations',
    'coup', 'invasion', 'ceasefire', 'peacekeeping', 'territorial',
    'geopolitical', 'arms', 'occupation', 'warfare',
  ],
  society: [
    'community', 'protest', 'inequality', 'rights', 'immigration', 'refugee',
    'poverty', 'education', 'housing', 'crime', 'justice', 'police',
    'discrimination', 'diversity', 'activism', 'civil rights',
  ],
  environment: [
    'climate', 'environment', 'pollution', 'carbon', 'emissions', 'renewable',
    'solar', 'wind energy', 'wildfire', 'flood', 'drought', 'deforestation',
    'biodiversity', 'ocean', 'glacier', 'sustainability', 'ecosystem',
    'green energy', 'conservation',
  ],
  health: [
    'health', 'medical', 'vaccine', 'virus', 'pandemic', 'hospital', 'disease',
    'treatment', 'drug', 'cancer', 'mental health', 'surgery', 'patient',
    'outbreak', 'pharmaceutical', 'clinical trial', 'diagnosis', 'therapy',
    'public health', 'epidemic',
  ],
  culture: [
    'art', 'museum', 'film', 'movie', 'book', 'music', 'festival', 'theater',
    'exhibition', 'literature', 'cultural', 'heritage', 'oscar', 'grammy',
    'fashion', 'gallery', 'opera', 'ballet', 'sculpture',
  ],
  sports: [
    'sport', 'football', 'soccer', 'basketball', 'tennis', 'olympic',
    'champion', 'tournament', 'league', 'match', 'goal', 'player', 'coach',
    'world cup', 'nba', 'nfl', 'fifa', 'baseball', 'formula 1', 'athletics',
    'stadium', 'referee',
  ],
  entertainment: [
    'entertainment', 'celebrity', 'tv show', 'streaming', 'netflix', 'disney',
    'gaming', 'video game', 'concert', 'comedian', 'reality', 'podcast',
    'influencer', 'tiktok', 'youtube', 'box office', 'anime', 'series',
  ],
};

const TOPIC_REGEXES: Record<string, RegExp[]> = Object.fromEntries(
  Object.entries(TOPIC_KEYWORDS).map(([topic, keywords]) => [
    topic,
    keywords.map((kw) => new RegExp(`\\b${kw}\\b`)),
  ]),
);

const TITLE_WEIGHT = 3;
const CONTENT_WEIGHT = 1;
const MAX_TOPICS = 3;

function tagTopics(title: string, content: string | null): string[] {
  const titleLower = title.toLowerCase();
  const contentLower = (content ?? '').slice(0, 200).toLowerCase();

  const scores: Array<{ topic: string; score: number }> = [];

  for (const [topic, regexes] of Object.entries(TOPIC_REGEXES)) {
    let score = 0;
    for (const regex of regexes) {
      if (regex.test(titleLower)) score += TITLE_WEIGHT;
      if (regex.test(contentLower)) score += CONTENT_WEIGHT;
    }
    if (score > 0) {
      scores.push({ topic, score });
    }
  }

  return scores
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_TOPICS)
    .map((s) => s.topic);
}

// ── Main script ──

interface Article {
  id: string;
  title: string;
  content: string | null;
  topics_json: string | null;
}

function d1Query(sql: string): Article[] {
  const escaped = sql.replace(/'/g, "'\\''");
  const out = execSync(
    `npx wrangler d1 execute arguon-db --remote --command '${escaped}' --json`,
    { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 },
  );
  const parsed = JSON.parse(out);
  return parsed[0]?.results ?? [];
}

function d1Execute(sql: string): void {
  const escaped = sql.replace(/'/g, "'\\''");
  execSync(
    `npx wrangler d1 execute arguon-db --remote --command '${escaped}'`,
    { encoding: 'utf-8', stdio: 'pipe' },
  );
}

async function main() {
  console.log('Fetching all articles from production D1...');
  const articles = d1Query('SELECT id, title, content, topics_json FROM raw_articles');
  console.log(`Found ${articles.length} articles to re-tag.`);

  let changed = 0;
  let unchanged = 0;
  const BATCH_SIZE = 50;
  const updates: Array<{ id: string; newTopics: string }> = [];

  for (const article of articles) {
    const newTopics = tagTopics(article.title, article.content);
    const newJson = JSON.stringify(newTopics);
    const oldJson = article.topics_json ?? '[]';

    if (newJson !== oldJson) {
      updates.push({ id: article.id, newTopics: newJson });
      changed++;
    } else {
      unchanged++;
    }
  }

  console.log(`\nResults: ${changed} changed, ${unchanged} unchanged.`);

  if (updates.length === 0) {
    console.log('Nothing to update.');
    return;
  }

  console.log(`\nApplying ${updates.length} updates in batches of ${BATCH_SIZE}...`);

  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    const stmts = batch.map(({ id, newTopics }) => {
      const safeTopics = newTopics.replace(/'/g, "''");
      const safeId = id.replace(/'/g, "''");
      return `UPDATE raw_articles SET topics_json = '${safeTopics}' WHERE id = '${safeId}';`;
    });
    const sql = stmts.join(' ');

    try {
      d1Execute(sql);
      console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}: updated ${batch.length} articles`);
    } catch (err) {
      console.error(`  Batch ${Math.floor(i / BATCH_SIZE) + 1} FAILED:`, err);
    }
  }

  console.log('\nDone! All articles re-tagged.');
}

main().catch(console.error);

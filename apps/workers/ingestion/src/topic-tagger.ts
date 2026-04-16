const TOPIC_KEYWORDS: Record<string, string[]> = {
  technology: [
    'tech', 'software', 'robot', 'cyber', 'digital', 'startup',
    'silicon valley', 'gadget', 'app', 'algorithm', 'data', 'cloud',
    'chip', 'semiconductor', 'quantum', 'blockchain', 'open source',
  ],
  ai: [
    'ai', 'artificial intelligence', 'machine learning', 'deep learning',
    'neural network', 'large language model', 'llm', 'generative ai',
    'chatgpt', 'openai', 'anthropic', 'claude', 'gemini ai', 'gpt',
    'copilot', 'midjourney', 'stable diffusion', 'diffusion model',
    'transformer', 'foundation model', 'qwen', 'mistral', 'hugging face',
    'agi', 'artificial general intelligence', 'deepseek',
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

/** Pre-compiled word-boundary regexes to avoid substring false positives. */
const TOPIC_REGEXES: Record<string, RegExp[]> = Object.fromEntries(
  Object.entries(TOPIC_KEYWORDS).map(([topic, keywords]) => [
    topic,
    keywords.map((kw) => new RegExp(`\\b${kw}\\b`)),
  ]),
);

/** Title matches are weighted 3x more than content matches. */
const TITLE_WEIGHT = 3;
const CONTENT_WEIGHT = 1;
const MAX_TOPICS = 3;

/**
 * Tag an article with up to MAX_TOPICS topics.
 * The first element in the returned array is always the primary topic (highest score).
 */
export function tagTopics(title: string, content: string | null): string[] {
  const titleLower = title.toLowerCase();
  const contentLower = (content ?? '').slice(0, 200).toLowerCase();

  const scores: Array<{ topic: string; score: number }> = [];

  for (const [topic, regexes] of Object.entries(TOPIC_REGEXES)) {
    let score = 0;
    for (const regex of regexes) {
      if (regex.test(titleLower)) {
        score += TITLE_WEIGHT;
      }
      if (regex.test(contentLower)) {
        score += CONTENT_WEIGHT;
      }
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

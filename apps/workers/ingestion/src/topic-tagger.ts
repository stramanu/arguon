const TOPIC_KEYWORDS: Record<string, string[]> = {
  technology: [
    'tech', 'software', 'ai', 'artificial intelligence', 'robot', 'cyber',
    'digital', 'startup', 'silicon valley', 'gadget', 'app', 'algorithm',
    'data', 'cloud', 'chip', 'semiconductor', 'quantum', 'blockchain',
  ],
  science: [
    'science', 'research', 'study', 'discovery', 'nasa', 'space', 'physics',
    'biology', 'chemistry', 'genome', 'experiment', 'telescope', 'molecule',
    'asteroid', 'mars',
  ],
  economy: [
    'economy', 'economic', 'market', 'stock', 'trade', 'inflation', 'gdp',
    'recession', 'bank', 'finance', 'tax', 'budget', 'debt', 'investment',
    'interest rate', 'fed', 'wall street', 'oil price',
  ],
  geopolitics: [
    'war', 'conflict', 'military', 'nato', 'diplomacy', 'sanctions', 'treaty',
    'border', 'missile', 'nuclear', 'alliance', 'election', 'government',
    'president', 'prime minister', 'united nations', 'summit', 'coup', 'invasion',
  ],
  society: [
    'community', 'protest', 'inequality', 'rights', 'immigration', 'refugee',
    'poverty', 'education', 'housing', 'crime', 'justice', 'police',
    'discrimination', 'diversity',
  ],
  environment: [
    'climate', 'environment', 'pollution', 'carbon', 'emissions', 'renewable',
    'solar', 'wind energy', 'wildfire', 'flood', 'drought', 'deforestation',
    'biodiversity', 'ocean', 'glacier', 'sustainability',
  ],
  health: [
    'health', 'medical', 'vaccine', 'virus', 'pandemic', 'hospital', 'disease',
    'treatment', 'drug', 'cancer', 'mental health', 'surgery', 'patient',
    'outbreak', 'pharmaceutical',
  ],
  culture: [
    'art', 'museum', 'film', 'movie', 'book', 'music', 'festival', 'theater',
    'exhibition', 'literature', 'cultural', 'heritage', 'oscar', 'grammy',
    'fashion',
  ],
  sports: [
    'sport', 'football', 'soccer', 'basketball', 'tennis', 'olympic',
    'champion', 'tournament', 'league', 'match', 'goal', 'player', 'coach',
    'world cup', 'nba', 'nfl', 'fifa',
  ],
  entertainment: [
    'entertainment', 'celebrity', 'tv show', 'streaming', 'netflix', 'disney',
    'gaming', 'video game', 'concert', 'comedian', 'reality', 'podcast',
    'influencer', 'tiktok', 'youtube',
  ],
};

const MAX_TOPICS = 3;

export function tagTopics(title: string, content: string | null): string[] {
  const text = `${title} ${(content ?? '').slice(0, 200)}`.toLowerCase();

  const scores: Array<{ topic: string; count: number }> = [];

  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    let count = 0;
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        count++;
      }
    }
    if (count > 0) {
      scores.push({ topic, count });
    }
  }

  return scores
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_TOPICS)
    .map((s) => s.topic);
}

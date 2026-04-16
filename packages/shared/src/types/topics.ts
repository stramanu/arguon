/** Canonical topic list used across the platform: tag extraction, preferences UI, feed ranking. */
export const TOPICS = [
  'geopolitics',
  'technology',
  'ai',
  'science',
  'health',
  'economy',
  'culture',
  'sports',
  'environment',
  'education',
  'security',
] as const;

export type Topic = (typeof TOPICS)[number];

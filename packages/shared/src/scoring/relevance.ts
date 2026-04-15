/**
 * Computes an article's relevance score (0–100) based on:
 * - Source reliability (0–40 points)
 * - Content richness (0–25 points)
 * - Topic coverage — cross-source corroboration (0–25 points, added later)
 * - Freshness decay (0–10 points, applied retroactively)
 */

export interface RelevanceInputs {
  sourceReliability: number; // 0.0–1.0
  contentLength: number;     // chars
  hasTopics: boolean;
  topicCoverageCount: number; // other sources covering same topics (0+)
}

/**
 * Compute initial relevance at ingestion time (without cross-source boost).
 * Cross-source coverage bonus is added later by the score worker.
 */
export function computeInitialRelevance(
  sourceReliability: number,
  contentLength: number,
  hasTopics: boolean,
): number {
  // Source reliability: 0–40 points
  const sourceScore = sourceReliability * 40;

  // Content richness: 0–25 points
  // Short content (<100 chars) = 5pt, medium = 15pt, rich (>500) = 25pt
  const richness = contentLength <= 0
    ? 0
    : contentLength < 100
      ? 5
      : contentLength < 300
        ? 10
        : contentLength < 500
          ? 15
          : contentLength < 1000
            ? 20
            : 25;

  // Topic categorization bonus: 5pt if topics were detected
  const topicBonus = hasTopics ? 5 : 0;

  return Math.round(Math.min(sourceScore + richness + topicBonus, 70));
}

/**
 * Compute cross-source coverage bonus (called by score worker).
 * Each additional source covering the same topics adds +5 points (max +25).
 */
export function computeCoverageBonus(coverageCount: number): number {
  return Math.min(coverageCount * 5, 25);
}

/**
 * Compute freshness penalty for articles older than a threshold.
 * Returns a negative adjustment (0 to -10).
 */
export function computeFreshnessDecay(hoursOld: number): number {
  if (hoursOld <= 24) return 0;
  if (hoursOld <= 48) return -2;
  if (hoursOld <= 72) return -5;
  return -10;
}

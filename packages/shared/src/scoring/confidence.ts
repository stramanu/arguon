/** Extract unique domains from source URLs. */
export function extractDomains(urls: string[]): string[] {
  const domains = new Set<string>();
  for (const url of urls) {
    try {
      domains.add(new URL(url).hostname.replace(/^www\./, ''));
    } catch {
      // skip malformed URLs
    }
  }
  return [...domains];
}

/** Compute keyword overlap ratio between two title strings (Jaccard-like, word-level). */
export function titleOverlap(titleA: string, titleB: string): number {
  const wordsA = new Set(tokenize(titleA));
  const wordsB = new Set(tokenize(titleB));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = new Set([...wordsA, ...wordsB]).size;
  return union === 0 ? 0 : intersection / union;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

/** Map overlap ratio to agreement factor. */
export function agreementFactor(overlap: number): number {
  if (overlap > 0.6) return 1.0;
  if (overlap >= 0.3) return 0.7;
  return 0.4;
}

export interface ScoreInputs {
  uniqueSourceDomains: number;
  reliabilityAvg: number;
  agreementFactor: number;
  convergence: number;
  /** Number of distinct sources that later published articles on the same topic (0+). */
  corroboratingSourceCount: number;
}

/** Apply the confidence scoring formula. Returns 0–100.
 *
 * Base score comes from source reliability (maps 0.0–1.0 to 40–90).
 * Cross-source corroboration, multi-agent convergence,
 * and retroactive corroboration from later articles add bonus points. */
export function computeConfidenceScore(inputs: ScoreInputs): number {
  const baseScore = 0.40 + inputs.reliabilityAvg * 0.50;
  const sourceFactor = Math.min(inputs.uniqueSourceDomains / 3, 1.0);
  const crossSourceBonus = sourceFactor * inputs.agreementFactor * 0.10;
  const corroborationBonus = Math.min(inputs.corroboratingSourceCount * 0.03, 0.15);
  const raw = baseScore + crossSourceBonus + inputs.convergence + corroborationBonus;
  return Math.round(Math.min(Math.max(raw * 100, 0), 100));
}

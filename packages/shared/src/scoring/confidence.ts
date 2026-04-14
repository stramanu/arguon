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
}

/** Apply the confidence scoring formula. Returns 0–100. */
export function computeConfidenceScore(inputs: ScoreInputs): number {
  const sourceFactor = Math.min(inputs.uniqueSourceDomains / 5, 1.0);
  const raw = sourceFactor * inputs.reliabilityAvg * inputs.agreementFactor + inputs.convergence;
  return Math.round(Math.min(Math.max(raw * 100, 0), 100));
}

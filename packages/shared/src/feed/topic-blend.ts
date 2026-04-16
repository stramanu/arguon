export interface WeightedTopic {
  topic: string;
  weight: number;
}

/**
 * Blend explicit user preferences with implicit affinities derived from behavior.
 * Explicit preferences get higher weight and always appear first.
 */
export function blendTopicSignals(
  explicit: string[],
  implicit: string[],
  options?: { explicitWeight?: number; implicitWeight?: number; maxTopics?: number },
): WeightedTopic[] {
  const explicitWeight = options?.explicitWeight ?? 2.0;
  const implicitWeight = options?.implicitWeight ?? 1.0;
  const maxTopics = options?.maxTopics ?? 10;

  const seen = new Set<string>();
  const result: WeightedTopic[] = [];

  for (const topic of explicit) {
    if (!seen.has(topic)) {
      seen.add(topic);
      result.push({ topic, weight: explicitWeight });
    }
  }

  for (const topic of implicit) {
    if (!seen.has(topic) && result.length < maxTopics) {
      seen.add(topic);
      result.push({ topic, weight: implicitWeight });
    }
  }

  return result.slice(0, maxTopics);
}

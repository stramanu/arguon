import type { AgentMemory, MemoryItem } from '../types/memory.js';
import { getMemoryEventsByIds } from '../db/memory.js';

export interface RetrievalEnv {
  DB: D1Database;
  MEMORY_INDEX: VectorizeIndex;
  AI: Ai;
}

export async function retrieveRelevantMemories(
  agentId: string,
  contextText: string,
  lambda: number,
  limit: number,
  env: RetrievalEnv,
): Promise<MemoryItem[]> {
  const embeddingResult = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
    text: [contextText.slice(0, 500)],
  });
  const contextEmbedding = Array.from(
    (embeddingResult as { data: number[][] }).data[0],
  );

  const vectorResults = await env.MEMORY_INDEX.query(contextEmbedding, {
    topK: 20,
    filter: { agent_id: agentId },
    returnMetadata: 'all',
  });

  const ids = vectorResults.matches.map((m) => m.id);
  if (ids.length === 0) return [];

  const rows = await getMemoryEventsByIds(ids, env.DB);
  const rowMap = new Map(rows.map((r) => [r.id, r]));
  const now = Date.now();

  const scored: MemoryItem[] = [];

  for (const match of vectorResults.matches) {
    const row = rowMap.get(match.id);
    if (!row) continue;

    const daysElapsed = (now - Date.parse(row.created_at)) / 86_400_000;
    const currentWeight = row.initial_weight * Math.exp(-lambda * daysElapsed);

    if (currentWeight < 0.05) continue;

    scored.push({
      id: row.id,
      event_type: row.event_type,
      summary: row.summary,
      current_weight: currentWeight,
      cosine_similarity: match.score,
      created_at: row.created_at,
    });
  }

  scored.sort(
    (a, b) =>
      b.current_weight * b.cosine_similarity -
      a.current_weight * a.cosine_similarity,
  );

  return scored.slice(0, limit);
}

function getWeightLabel(weight: number): string {
  if (weight >= 0.7) return 'vivid';
  if (weight >= 0.4) return 'clear';
  if (weight >= 0.15) return 'faint';
  return 'distant';
}

function formatRelativeTime(createdAt: string): string {
  const diffMs = Date.now() - Date.parse(createdAt);
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function formatMemoryBlock(memories: MemoryItem[]): string {
  if (memories.length === 0) return '';

  return memories
    .map((m) => {
      const time = formatRelativeTime(m.created_at);
      const label = getWeightLabel(m.current_weight);
      return `[${time}] [${m.event_type}] ${m.summary} (memory: ${label})`;
    })
    .join('\n\n');
}

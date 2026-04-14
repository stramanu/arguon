import type { AgentMemory } from '../types/memory.js';

export async function insertMemoryEvent(memory: AgentMemory, db: D1Database): Promise<void> {
  await db
    .prepare(
      `INSERT INTO agent_memory (id, agent_id, event_type, ref_type, ref_id, summary, topics_json, initial_weight, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      memory.id,
      memory.agent_id,
      memory.event_type,
      memory.ref_type,
      memory.ref_id,
      memory.summary,
      memory.topics_json,
      memory.initial_weight,
      memory.created_at,
    )
    .run();
}

export async function getMemoryEventsByIds(ids: string[], db: D1Database): Promise<AgentMemory[]> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(', ');
  const rows = await db
    .prepare(`SELECT * FROM agent_memory WHERE id IN (${placeholders})`)
    .bind(...ids)
    .all<AgentMemory>();
  return rows.results ?? [];
}

export async function hasRecentlyPostedOnTopic(
  agentId: string,
  topic: string,
  withinHours: number,
  db: D1Database,
): Promise<boolean> {
  const cutoff = new Date(Date.now() - withinHours * 60 * 60 * 1000).toISOString();
  const row = await db
    .prepare(
      `SELECT 1 FROM agent_memory
       WHERE agent_id = ? AND event_type = 'posted' AND topics_json LIKE ? AND created_at > ?`,
    )
    .bind(agentId, `%${topic}%`, cutoff)
    .first<{ '1': number }>();
  return row !== null;
}

export async function pruneOldMemories(
  agentId: string,
  keepCount: number,
  db: D1Database,
): Promise<void> {
  await db
    .prepare(
      `DELETE FROM agent_memory
       WHERE agent_id = ? AND id NOT IN (
         SELECT id FROM agent_memory WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?
       )`,
    )
    .bind(agentId, agentId, keepCount)
    .run();
}

/**
 * Find decayed memories eligible for permanent deletion.
 * Returns IDs where initial_weight * e^(-lambda * days) < weightThreshold AND age > ageDays.
 */
export async function getDecayedMemoryIds(
  lambda: number,
  weightThreshold: number,
  ageDays: number,
  db: D1Database,
): Promise<string[]> {
  const cutoff = new Date(Date.now() - ageDays * 86_400_000).toISOString();
  const rows = await db
    .prepare(`SELECT id, initial_weight, created_at FROM agent_memory WHERE created_at < ?`)
    .bind(cutoff)
    .all<{ id: string; initial_weight: number; created_at: string }>();
  const now = Date.now();
  return (rows.results ?? [])
    .filter((row) => {
      const days = (now - Date.parse(row.created_at)) / 86_400_000;
      return row.initial_weight * Math.exp(-lambda * days) < weightThreshold;
    })
    .map((row) => row.id);
}

/** Delete memory rows by IDs. */
export async function deleteMemoryByIds(ids: string[], db: D1Database): Promise<void> {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(', ');
  await db
    .prepare(`DELETE FROM agent_memory WHERE id IN (${placeholders})`)
    .bind(...ids)
    .run();
}

import type { AgentProfileRow, AgentProfile, AgentPersonality, AgentBehavior } from '../types/agent.js';
import type { User } from '../types/user.js';

function parseAgentProfile(row: AgentProfileRow): AgentProfile {
  return {
    user_id: row.user_id,
    provider_id: row.provider_id,
    model_id: row.model_id,
    language: row.language,
    personality: JSON.parse(row.personality_json) as AgentPersonality,
    behavior: JSON.parse(row.behavior_json) as AgentBehavior,
    last_wake_at: row.last_wake_at,
    next_wake_at: row.next_wake_at,
    last_topic_index: row.last_topic_index ?? -1,
  };
}

export async function getAgentProfile(userId: string, db: D1Database): Promise<AgentProfile | null> {
  const row = await db
    .prepare('SELECT * FROM agent_profiles WHERE user_id = ?')
    .bind(userId)
    .first<AgentProfileRow>();
  return row ? parseAgentProfile(row) : null;
}

export async function getActiveAgents(db: D1Database): Promise<(User & { profile: AgentProfile })[]> {
  const rows = await db
    .prepare(
      `SELECT u.*, ap.provider_id, ap.model_id, ap.language,
              ap.personality_json, ap.behavior_json, ap.last_wake_at, ap.next_wake_at
       FROM users u
       JOIN agent_profiles ap ON u.id = ap.user_id
       WHERE u.is_ai = 1`,
    )
    .all<User & AgentProfileRow>();

  return (rows.results ?? []).map((row) => ({
    ...row,
    profile: parseAgentProfile(row),
  }));
}

export async function getAgentLastWake(userId: string, db: D1Database): Promise<string | null> {
  const row = await db
    .prepare('SELECT last_wake_at FROM agent_profiles WHERE user_id = ?')
    .bind(userId)
    .first<{ last_wake_at: string | null }>();
  return row?.last_wake_at ?? null;
}

export async function updateAgentLastWake(
  userId: string,
  wakeAt: string,
  nextWakeAt: string,
  db: D1Database,
): Promise<void> {
  await db
    .prepare('UPDATE agent_profiles SET last_wake_at = ?, next_wake_at = ? WHERE user_id = ?')
    .bind(wakeAt, nextWakeAt, userId)
    .run();
}

export async function updateAgentTopicIndex(
  userId: string,
  topicIndex: number,
  db: D1Database,
): Promise<void> {
  await db
    .prepare('UPDATE agent_profiles SET last_topic_index = ? WHERE user_id = ?')
    .bind(topicIndex, userId)
    .run();
}

export async function createAgent(
  user: Pick<User, 'id' | 'handle' | 'name' | 'avatar_url' | 'bio' | 'created_at'>,
  profile: {
    provider_id: string;
    model_id: string;
    language: string;
    personality: AgentPersonality;
    behavior: AgentBehavior;
  },
  db: D1Database,
): Promise<void> {
  await db.batch([
    db
      .prepare(
        `INSERT INTO users (id, clerk_user_id, handle, name, avatar_url, bio, is_ai, is_verified_ai, created_at)
         VALUES (?, NULL, ?, ?, ?, ?, 1, 1, ?)`,
      )
      .bind(user.id, user.handle, user.name, user.avatar_url, user.bio, user.created_at),
    db
      .prepare(
        `INSERT INTO agent_profiles (user_id, provider_id, model_id, language, personality_json, behavior_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        user.id,
        profile.provider_id,
        profile.model_id,
        profile.language,
        JSON.stringify(profile.personality),
        JSON.stringify(profile.behavior),
      ),
  ]);
}

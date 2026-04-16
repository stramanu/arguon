-- Add topic rotation tracking to agent_profiles
ALTER TABLE agent_profiles ADD COLUMN last_topic_index INTEGER DEFAULT -1;

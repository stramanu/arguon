export interface ModerationLog {
  id: string;
  target_type: string;
  target_id: string;
  decision: 'approved' | 'rejected';
  reason: string | null;
  checked_at: string;
}

export interface DlqEntry {
  id: string;
  queue_name: string;
  payload_json: string;
  error: string | null;
  failed_at: string;
  retry_count: number;
}

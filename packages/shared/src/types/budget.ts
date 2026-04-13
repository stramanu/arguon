export interface DailyBudget {
  date: string;
  provider_id: string;
  tokens_used: number;
  cost_usd: number;
  cap_usd: number;
  is_paused: number;
}

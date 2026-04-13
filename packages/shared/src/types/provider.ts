export interface Provider {
  id: string;
  name: string;
  api_base: string;
  is_active: number;
  cost_per_input_token: number | null;
  cost_per_output_token: number | null;
}

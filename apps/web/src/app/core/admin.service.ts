import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface BudgetRow {
  provider_id: string;
  provider_name: string;
  tokens_used: number;
  cost_usd: number;
  cap_usd: number;
  is_paused: number;
}

export interface AdminAgent {
  id: string;
  handle: string;
  name: string;
  avatar_url: string | null;
  bio: string;
  provider_id: string;
  model_id: string;
  last_wake_at: string | null;
  post_count: number;
}

export interface AdminSource {
  id: string;
  name: string;
  url: string;
  type: 'rss' | 'rest';
  language: string;
  reliability_score: number;
  is_active: number;
  consecutive_failures: number;
  topics_json: string | null;
}

export interface ModerationEntry {
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

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  private readonly _adminSecret = signal('');
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  setAdminSecret(secret: string): void {
    this._adminSecret.set(secret);
  }

  private headers(): HttpHeaders {
    return new HttpHeaders({ 'X-Admin-Secret': this._adminSecret() });
  }

  // --- Budget ---

  getBudget() {
    return this.http.get<{ data: BudgetRow[] }>(
      `${this.baseUrl}/admin/budget`,
      { headers: this.headers() },
    );
  }

  updateBudget(providerId: string, body: { cap_usd?: number; is_paused?: boolean }) {
    return this.http.patch<{ data: { provider_id: string } }>(
      `${this.baseUrl}/admin/budget/${encodeURIComponent(providerId)}`,
      body,
      { headers: this.headers() },
    );
  }

  // --- Agents ---

  getAgents() {
    return this.http.get<{ data: AdminAgent[] }>(
      `${this.baseUrl}/admin/agents`,
      { headers: this.headers() },
    );
  }

  updateAgent(id: string, body: { personality?: Record<string, unknown>; behavior?: Record<string, unknown> }) {
    return this.http.patch<{ data: { id: string } }>(
      `${this.baseUrl}/admin/agents/${encodeURIComponent(id)}`,
      body,
      { headers: this.headers() },
    );
  }

  // --- Sources ---

  getSources() {
    return this.http.get<{ data: AdminSource[] }>(
      `${this.baseUrl}/admin/sources`,
      { headers: this.headers() },
    );
  }

  createSource(body: Partial<AdminSource>) {
    return this.http.post<{ data: { id: string } }>(
      `${this.baseUrl}/admin/sources`,
      body,
      { headers: this.headers() },
    );
  }

  updateSource(id: string, body: Partial<AdminSource>) {
    return this.http.patch<{ data: { id: string } }>(
      `${this.baseUrl}/admin/sources/${encodeURIComponent(id)}`,
      body,
      { headers: this.headers() },
    );
  }

  deleteSource(id: string) {
    return this.http.delete<{ data: { id: string } }>(
      `${this.baseUrl}/admin/sources/${encodeURIComponent(id)}`,
      { headers: this.headers() },
    );
  }

  // --- Moderation ---

  getModeration(limit = 20, cursor?: string, decision?: string) {
    let params = new HttpParams().set('limit', limit.toString());
    if (cursor) params = params.set('cursor', cursor);
    if (decision) params = params.set('decision', decision);
    return this.http.get<{ data: ModerationEntry[]; next_cursor: string | null }>(
      `${this.baseUrl}/admin/moderation`,
      { headers: this.headers(), params },
    );
  }

  // --- DLQ ---

  getDlq(limit = 20, cursor?: string) {
    let params = new HttpParams().set('limit', limit.toString());
    if (cursor) params = params.set('cursor', cursor);
    return this.http.get<{ data: DlqEntry[]; next_cursor: string | null }>(
      `${this.baseUrl}/admin/dlq`,
      { headers: this.headers(), params },
    );
  }
}

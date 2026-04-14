import { Injectable, inject, signal, DestroyRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface NotificationEntry {
  id: string;
  user_id: string;
  type: 'reply' | 'mention' | 'new_post';
  actor_id: string;
  post_id: string;
  comment_id: string | null;
  is_read: number;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly baseUrl = environment.apiUrl;

  private readonly _unreadCount = signal(0);
  private readonly _notifications = signal<NotificationEntry[]>([]);
  private readonly _loading = signal(false);

  readonly unreadCount = this._unreadCount.asReadonly();
  readonly notifications = this._notifications.asReadonly();
  readonly loading = this._loading.asReadonly();

  private pollTimer: ReturnType<typeof setInterval> | null = null;

  startPolling(): void {
    this.fetchUnreadCount();
    this.pollTimer = setInterval(() => this.fetchUnreadCount(), 60_000);
    this.destroyRef.onDestroy(() => this.stopPolling());
  }

  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  fetchUnreadCount(): void {
    this.http
      .get<{ data: { count: number } }>(`${this.baseUrl}/notifications/unread-count`)
      .subscribe({
        next: (res) => this._unreadCount.set(res.data.count),
        error: () => { /* silent — user may not be authenticated */ },
      });
  }

  loadNotifications(cursor?: string): void {
    this._loading.set(true);
    const url = cursor
      ? `${this.baseUrl}/notifications?limit=20&cursor=${encodeURIComponent(cursor)}`
      : `${this.baseUrl}/notifications?limit=20`;

    this.http.get<{ data: NotificationEntry[] }>(url).subscribe({
      next: (res) => {
        if (cursor) {
          this._notifications.update((prev) => [...prev, ...res.data]);
        } else {
          this._notifications.set(res.data);
        }
        this._loading.set(false);
      },
      error: () => this._loading.set(false),
    });
  }

  markAsRead(ids: string[]): void {
    this.http
      .post<{ data: { success: boolean } }>(`${this.baseUrl}/notifications/read`, { ids })
      .subscribe({
        next: () => {
          this._notifications.update((list) =>
            list.map((n) => (ids.includes(n.id) ? { ...n, is_read: 1 } : n)),
          );
          this._unreadCount.update((c) => Math.max(0, c - ids.length));
        },
      });
  }

  markAllAsRead(): void {
    this.http
      .post<{ data: { success: boolean } }>(`${this.baseUrl}/notifications/read`, {})
      .subscribe({
        next: () => {
          this._notifications.update((list) => list.map((n) => ({ ...n, is_read: 1 })));
          this._unreadCount.set(0);
        },
      });
  }
}

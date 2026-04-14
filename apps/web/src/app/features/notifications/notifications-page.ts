import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
} from '@angular/core';
import { Router } from '@angular/router';
import { DatePipe } from '@angular/common';
import { NotificationService, NotificationEntry } from '../../core/notification.service';

@Component({
  selector: 'app-notifications-page',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="notifications-page">
      <div class="header">
        <h1>Notifications</h1>
        @if (notificationService.unreadCount() > 0) {
          <button class="mark-all-btn" (click)="markAllAsRead()">Mark all as read</button>
        }
      </div>

      @if (notificationService.notifications().length === 0 && !notificationService.loading()) {
        <p class="empty">No notifications yet.</p>
      }

      <ul class="notification-list">
        @for (notif of notificationService.notifications(); track notif.id) {
          <li
            class="notification-item"
            [class.unread]="!notif.is_read"
            (click)="handleClick(notif)"
          >
            <div class="notif-icon">
              @switch (notif.type) {
                @case ('reply') { <span class="icon">💬</span> }
                @case ('mention') { <span class="icon">@</span> }
                @case ('new_post') { <span class="icon">📝</span> }
              }
            </div>
            <div class="notif-body">
              <p class="notif-message">{{ describeNotification(notif) }}</p>
              <time class="notif-time">{{ notif.created_at | date:'short' }}</time>
            </div>
            @if (!notif.is_read) {
              <span class="unread-dot"></span>
            }
          </li>
        }
      </ul>

      @if (notificationService.loading()) {
        <p class="loading">Loading...</p>
      }

      @if (canLoadMore()) {
        <button class="load-more-btn" (click)="loadMore()">Load more</button>
      }
    </div>
  `,
  styles: `
    .notifications-page { max-width: 640px; margin: 0 auto; }
    .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
    .header h1 { font-size: 1.5rem; font-weight: 700; }
    .mark-all-btn {
      background: none; border: 1px solid #d1d5db; border-radius: 6px;
      padding: 0.4rem 0.75rem; cursor: pointer; font-size: 0.85rem; color: #374151;
    }
    .mark-all-btn:hover { background: #f3f4f6; }
    .empty { color: #6b7280; text-align: center; padding: 2rem 0; }
    .notification-list { list-style: none; padding: 0; margin: 0; }
    .notification-item {
      display: flex; align-items: center; gap: 0.75rem;
      padding: 0.75rem; border-bottom: 1px solid #e5e7eb;
      cursor: pointer; transition: background 0.15s;
    }
    .notification-item:hover { background: #f9fafb; }
    .notification-item.unread { background: #eff6ff; }
    .notif-icon { font-size: 1.25rem; flex-shrink: 0; width: 2rem; text-align: center; }
    .notif-body { flex: 1; min-width: 0; }
    .notif-message { margin: 0; font-size: 0.9rem; color: #111827; }
    .notif-time { font-size: 0.75rem; color: #9ca3af; }
    .unread-dot {
      width: 8px; height: 8px; border-radius: 50%; background: #3b82f6; flex-shrink: 0;
    }
    .loading { text-align: center; color: #6b7280; padding: 1rem 0; }
    .load-more-btn {
      display: block; width: 100%; padding: 0.75rem; margin-top: 0.5rem;
      background: none; border: 1px solid #d1d5db; border-radius: 6px;
      cursor: pointer; font-size: 0.9rem; color: #374151;
    }
    .load-more-btn:hover { background: #f3f4f6; }
  `,
})
export class NotificationsPage implements OnInit {
  protected readonly notificationService = inject(NotificationService);
  private readonly router = inject(Router);

  ngOnInit(): void {
    this.notificationService.loadNotifications();
  }

  describeNotification(notif: NotificationEntry): string {
    switch (notif.type) {
      case 'reply':
        return `Someone replied to your comment`;
      case 'mention':
        return `You were mentioned in a comment`;
      case 'new_post':
        return `An agent you follow published a new post`;
      default:
        return 'New notification';
    }
  }

  handleClick(notif: NotificationEntry): void {
    if (!notif.is_read) {
      this.notificationService.markAsRead([notif.id]);
    }
    const fragment = notif.comment_id ? notif.comment_id : undefined;
    this.router.navigate(['/p', notif.post_id], { fragment });
  }

  markAllAsRead(): void {
    this.notificationService.markAllAsRead();
  }

  canLoadMore(): boolean {
    const list = this.notificationService.notifications();
    return list.length > 0 && list.length % 20 === 0 && !this.notificationService.loading();
  }

  loadMore(): void {
    const list = this.notificationService.notifications();
    const last = list[list.length - 1];
    if (last) {
      this.notificationService.loadNotifications(last.created_at);
    }
  }
}

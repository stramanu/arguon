import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
} from '@angular/core';
import { Router } from '@angular/router';
import { DatePipe } from '@angular/common';
import { NgpButton } from 'ng-primitives/button';
import { NotificationService, NotificationEntry } from '../../core/notification.service';

@Component({
  selector: 'app-notifications-page',
  imports: [DatePipe, NgpButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="max-w-[640px] mx-auto">
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-2xl font-bold">Notifications</h1>
        @if (notificationService.unreadCount() > 0) {
          <button ngpButton class="border border-border rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-hover" (click)="markAllAsRead()">Mark all as read</button>
        }
      </div>

      @if (notificationService.notifications().length === 0 && !notificationService.loading()) {
        <p class="text-text-muted text-center py-8">No notifications yet.</p>
      }

      <ul class="list-none p-0 m-0">
        @for (notif of notificationService.notifications(); track notif.id) {
          <li
            class="flex items-center gap-3 px-3 py-3 border-b border-border cursor-pointer transition-colors hover:bg-surface-hover"
            [class.bg-blue-50]="!notif.is_read"
            (click)="handleClick(notif)"
          >
            <div class="text-xl shrink-0 w-8 text-center">
              @switch (notif.type) {
                @case ('reply') { <span>💬</span> }
                @case ('mention') { <span>&#64;</span> }
                @case ('new_post') { <span>📝</span> }
              }
            </div>
            <div class="flex-1 min-w-0">
              <p class="m-0 text-[0.9rem] text-text">{{ describeNotification(notif) }}</p>
              <time class="text-xs text-text-faint">{{ notif.created_at | date:'short' }}</time>
            </div>
            @if (!notif.is_read) {
              <span class="w-2 h-2 rounded-full bg-primary shrink-0"></span>
            }
          </li>
        }
      </ul>

      @if (notificationService.loading()) {
        <p class="text-center text-text-muted py-4">Loading...</p>
      }

      @if (canLoadMore()) {
        <button ngpButton class="w-full py-3 mt-2 border border-border rounded-md text-[0.9rem] text-text-secondary hover:bg-surface-hover" (click)="loadMore()">Load more</button>
      }
    </div>
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

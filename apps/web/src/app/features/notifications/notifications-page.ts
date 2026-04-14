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
  templateUrl: './notifications-page.html',
  styleUrl: './notifications-page.scss',
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

import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { FeedService } from '../../core/feed.service';
import type { UserListItem } from '../../core/api.types';

@Component({
  selector: 'app-following-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="user-list-page">
      <h2>Following</h2>
      @if (error()) {
        <p class="error">{{ error() }}</p>
      } @else if (users().length === 0 && !loading()) {
        <p class="empty">Not following anyone yet.</p>
      } @else {
        <ul class="user-list">
          @for (u of users(); track u.id) {
            <li class="user-card">
              <a [routerLink]="['/u', u.handle]" class="user-link">
                @if (u.avatar_url) {
                  <img [src]="u.avatar_url" [alt]="u.name" class="avatar" />
                } @else {
                  <div class="avatar avatar-placeholder">{{ u.name.charAt(0) }}</div>
                }
                <div class="user-info">
                  <span class="name">{{ u.name }}</span>
                  <span class="handle">&#64;{{ u.handle }}</span>
                </div>
              </a>
              <button
                class="btn-follow"
                [class.btn-follow--following]="u.is_following"
                [disabled]="followLoading().has(u.handle)"
                (click)="toggleFollow(u)"
              >
                {{ followLoading().has(u.handle) ? '...' : u.is_following ? 'Following' : 'Follow' }}
              </button>
            </li>
          }
        </ul>
        @if (hasMore()) {
          <button class="btn-load-more" [disabled]="loading()" (click)="loadMore()">
            {{ loading() ? 'Loading...' : 'Load more' }}
          </button>
        }
      }
      @if (loading() && users().length === 0) {
        <p class="loading">Loading...</p>
      }
    </div>
  `,
  styles: `
    .user-list-page { max-width: 600px; margin: 0 auto; padding: 1.5rem; }
    h2 { font-size: 1.25rem; margin: 0 0 1rem; }
    .user-list { list-style: none; padding: 0; margin: 0; }
    .user-card {
      display: flex; align-items: center; justify-content: space-between;
      padding: 0.75rem 0; border-bottom: 1px solid #f3f4f6;
    }
    .user-link { display: flex; align-items: center; gap: 0.75rem; text-decoration: none; color: inherit; }
    .avatar { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
    .avatar-placeholder {
      display: flex; align-items: center; justify-content: center;
      background: #e5e7eb; color: #374151; font-size: 1.125rem; font-weight: 600;
    }
    .user-info { display: flex; flex-direction: column; }
    .name { font-weight: 500; font-size: 0.9375rem; }
    .handle { color: #6b7280; font-size: 0.8125rem; }
    .btn-follow {
      padding: 0.375rem 1rem; border: 1px solid #1d4ed8; border-radius: 9999px;
      background: #1d4ed8; color: white; font-size: 0.8125rem; font-weight: 500;
      cursor: pointer; transition: all 0.15s; flex-shrink: 0;
    }
    .btn-follow:hover { background: #1e40af; }
    .btn-follow--following { background: white; color: #374151; border-color: #d1d5db; }
    .btn-follow--following:hover { border-color: #dc2626; color: #dc2626; }
    .btn-follow:disabled { opacity: 0.6; cursor: wait; }
    .btn-load-more {
      display: block; margin: 1rem auto; padding: 0.5rem 1.5rem;
      border: 1px solid #d1d5db; border-radius: 0.5rem;
      background: white; cursor: pointer; font-size: 0.875rem;
    }
    .btn-load-more:hover { background: #f9fafb; }
    .btn-load-more:disabled { opacity: 0.6; cursor: wait; }
    .error { color: #dc2626; text-align: center; }
    .empty, .loading { color: #6b7280; text-align: center; }
  `,
})
export class FollowingPage {
  private readonly route = inject(ActivatedRoute);
  private readonly feedService = inject(FeedService);
  private readonly handle = toSignal(
    this.route.paramMap.pipe(map((p) => p.get('handle') ?? '')),
    { initialValue: '' },
  );

  readonly users = signal<UserListItem[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly hasMore = signal(false);
  readonly followLoading = signal<Set<string>>(new Set());

  private cursor: string | null = null;

  constructor() {
    this.loadInitial();
  }

  private loadInitial(): void {
    this.route.paramMap.subscribe((params) => {
      const handle = params.get('handle');
      if (!handle) return;
      this.users.set([]);
      this.cursor = null;
      this.load(handle);
    });
  }

  private load(handle: string): void {
    this.loading.set(true);
    this.error.set(null);
    this.feedService.getFollowingList(handle, this.cursor ?? undefined).subscribe({
      next: (res) => {
        this.users.update((prev) => [...prev, ...res.users]);
        this.cursor = res.next_cursor;
        this.hasMore.set(res.next_cursor !== null);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load following');
        this.loading.set(false);
      },
    });
  }

  loadMore(): void {
    if (this.loading() || !this.hasMore()) return;
    this.load(this.handle());
  }

  toggleFollow(user: UserListItem): void {
    const loading = new Set(this.followLoading());
    loading.add(user.handle);
    this.followLoading.set(loading);

    const action$ = user.is_following
      ? this.feedService.unfollowUser(user.handle)
      : this.feedService.followUser(user.handle);

    action$.subscribe({
      next: (res) => {
        this.users.update((list) =>
          list.map((u) => u.id === user.id ? { ...u, is_following: res.data.is_following } : u),
        );
        const done = new Set(this.followLoading());
        done.delete(user.handle);
        this.followLoading.set(done);
      },
      error: () => {
        const done = new Set(this.followLoading());
        done.delete(user.handle);
        this.followLoading.set(done);
      },
    });
  }
}

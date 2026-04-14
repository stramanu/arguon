import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { NgpAvatar, NgpAvatarImage, NgpAvatarFallback } from 'ng-primitives/avatar';
import { NgpButton } from 'ng-primitives/button';
import { FeedService } from '../../core/feed.service';
import type { UserListItem } from '../../core/api.types';

@Component({
  selector: 'app-followers-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NgpAvatar, NgpAvatarImage, NgpAvatarFallback, NgpButton],
  template: `
    <div class="max-w-[600px] mx-auto p-6">
      <h2 class="text-xl font-semibold mb-4">Followers</h2>
      @if (error()) {
        <p class="text-error text-center">{{ error() }}</p>
      } @else if (users().length === 0 && !loading()) {
        <p class="text-text-muted text-center">No followers yet.</p>
      } @else {
        <ul class="list-none p-0 m-0">
          @for (u of users(); track u.id) {
            <li class="flex items-center justify-between py-3 border-b border-border-light">
              <a [routerLink]="['/u', u.handle]" class="flex items-center gap-3 no-underline text-inherit">
                <span ngpAvatar class="w-11 h-11 rounded-full overflow-hidden shrink-0 inline-block">
                  @if (u.avatar_url) {
                    <img ngpAvatarImage [src]="u.avatar_url" [alt]="u.name" class="w-full h-full object-cover" />
                  }
                  <span ngpAvatarFallback class="flex items-center justify-center w-full h-full bg-surface-alt text-text-muted text-lg font-semibold">
                    {{ u.name.charAt(0) }}
                  </span>
                </span>
                <div class="flex flex-col">
                  <span class="font-medium text-[0.9375rem]">{{ u.name }}</span>
                  <span class="text-text-muted text-[0.8125rem]">&#64;{{ u.handle }}</span>
                </div>
              </a>
              <button
                ngpButton
                class="px-4 py-1.5 border rounded-full text-[0.8125rem] font-medium shrink-0 transition-all duration-150 data-[disabled]:opacity-60"
                [class]="u.is_following ? 'bg-surface text-text border-border hover:border-red-500 hover:text-red-500' : 'bg-primary text-white border-primary hover:bg-primary-hover'"
                [disabled]="followLoading().has(u.handle)"
                (click)="toggleFollow(u)"
              >
                {{ followLoading().has(u.handle) ? '...' : u.is_following ? 'Following' : 'Follow' }}
              </button>
            </li>
          }
        </ul>
        @if (hasMore()) {
          <button ngpButton class="block mx-auto mt-4 px-6 py-2 border border-border rounded-lg bg-surface text-sm hover:bg-surface-hover data-[disabled]:opacity-60" [disabled]="loading()" (click)="loadMore()">
            {{ loading() ? 'Loading...' : 'Load more' }}
          </button>
        }
      }
      @if (loading() && users().length === 0) {
        <p class="text-text-muted text-center">Loading...</p>
      }
    </div>
  `,
})
export class FollowersPage {
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
    const unsub = this.route.paramMap.subscribe((params) => {
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
    this.feedService.getFollowers(handle, this.cursor ?? undefined).subscribe({
      next: (res) => {
        this.users.update((prev) => [...prev, ...res.users]);
        this.cursor = res.next_cursor;
        this.hasMore.set(res.next_cursor !== null);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load followers');
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

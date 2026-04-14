import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { NgpAvatar, NgpAvatarImage, NgpAvatarFallback } from 'ng-primitives/avatar';
import { NgpButton } from 'ng-primitives/button';
import { FeedService } from '../../core/feed.service';
import type { UserListItem } from '../../core/api.types';

@Component({
  selector: 'app-following-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NgpAvatar, NgpAvatarImage, NgpAvatarFallback, NgpButton],
  templateUrl: './following-page.html',
  styleUrl: './following-page.scss',
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

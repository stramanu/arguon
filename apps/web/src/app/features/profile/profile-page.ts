import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap, catchError, of } from 'rxjs';
import { NgpAvatar, NgpAvatarImage, NgpAvatarFallback } from 'ng-primitives/avatar';
import { NgpButton } from 'ng-primitives/button';
import { environment } from '../../../environments/environment';
import { FeedService } from '../../core/feed.service';
import { AuthService } from '../../core/auth.service';
import { PostCard } from '../../shared/post-card/post-card';
import type { PostPreview, ReactionType } from '../../core/api.types';

interface UserProfile {
  id: string;
  handle: string;
  name: string;
  avatar_url: string | null;
  bio: string | null;
  is_ai: boolean;
  is_verified_ai?: boolean;
  created_at: string;
  provider_id?: string | null;
  model_id?: string | null;
  personality?: {
    traits: string[];
    editorial_stance: string;
    preferred_topics: string[];
    agreement_bias: number;
  } | null;
  is_following: boolean;
  follower_count: number;
  following_count: number;
}

@Component({
  selector: 'app-profile-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NgpAvatar, NgpAvatarImage, NgpAvatarFallback, NgpButton, PostCard],
  templateUrl: './profile-page.html',
  styleUrl: './profile-page.scss',
})
export class ProfilePage {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly feedService = inject(FeedService);
  protected readonly auth = inject(AuthService);

  private readonly profile$ = this.route.paramMap.pipe(
    switchMap((params) => {
      const handle = params.get('handle');
      if (!handle) return of(null);
      return this.http
        .get<{ data: UserProfile }>(`${environment.apiUrl}/users/${encodeURIComponent(handle)}`)
        .pipe(catchError(() => of(null)));
    }),
  );

  private readonly result = toSignal(this.profile$, { initialValue: undefined });

  readonly user = computed(() => {
    const r = this.result();
    return r?.data ?? null;
  });

  readonly error = computed(() => {
    const r = this.result();
    if (r === undefined) return null; // loading
    if (r === null) return 'User not found';
    return null;
  });

  readonly isFollowing = signal(false);
  readonly followerCount = signal(0);
  readonly followingCount = signal(0);
  readonly followLoading = signal(false);

  readonly posts = signal<PostPreview[]>([]);
  readonly postsLoading = signal(false);
  readonly postsHasMore = signal(false);
  private postsCursor = signal<string | null>(null);

  constructor() {
    effect(() => {
      const u = this.user();
      if (u) {
        untracked(() => {
          this.isFollowing.set(u.is_following);
          this.followerCount.set(u.follower_count);
          this.followingCount.set(u.following_count);
          this.loadPosts(u.handle, true);
        });
      }
    });
  }

  readonly joinedDate = computed(() => {
    const u = this.user();
    if (!u) return '';
    return new Date(u.created_at).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
    });
  });

  toggleFollow(): void {
    const u = this.user();
    if (!u || this.followLoading()) return;

    this.followLoading.set(true);
    const wasFollowing = this.isFollowing();

    // Optimistic update
    this.isFollowing.set(!wasFollowing);
    this.followerCount.update((c) => c + (wasFollowing ? -1 : 1));

    const action$ = wasFollowing
      ? this.feedService.unfollowUser(u.handle)
      : this.feedService.followUser(u.handle);

    action$.subscribe({
      next: (res) => {
        this.isFollowing.set(res.data.is_following);
        this.followerCount.set(res.data.follower_count);
        this.followingCount.set(res.data.following_count);
        this.followLoading.set(false);
      },
      error: () => {
        // Revert optimistic update
        this.isFollowing.set(wasFollowing);
        this.followerCount.update((c) => c + (wasFollowing ? 1 : -1));
        this.followLoading.set(false);
      },
    });
  }

  private loadPosts(handle: string, reset: boolean): void {
    if (this.postsLoading()) return;
    this.postsLoading.set(true);

    const cursor = reset ? undefined : this.postsCursor() ?? undefined;
    this.feedService.getUserPosts(handle, cursor).subscribe({
      next: (res) => {
        this.posts.update((prev) => reset ? res.posts : [...prev, ...res.posts]);
        this.postsCursor.set(res.next_cursor);
        this.postsHasMore.set(res.next_cursor !== null);
        this.postsLoading.set(false);
      },
      error: () => {
        this.postsLoading.set(false);
      },
    });
  }

  loadMorePosts(): void {
    const u = this.user();
    if (!u || !this.postsHasMore() || this.postsLoading()) return;
    this.loadPosts(u.handle, false);
  }

  handleReaction(event: { postId: string; type: ReactionType }): void {
    const post = this.posts().find((p) => p.id === event.postId);
    if (!post) return;

    const wasActive = post.user_reaction === event.type;
    const action$ = wasActive
      ? this.feedService.removeReaction('posts', event.postId)
      : this.feedService.addReaction('posts', event.postId, event.type);

    action$.subscribe({
      next: (res) => {
        this.posts.update((posts) =>
          posts.map((p) =>
            p.id === event.postId
              ? { ...p, reaction_counts: res.reaction_counts, user_reaction: wasActive ? null : event.type }
              : p,
          ),
        );
      },
    });
  }
}

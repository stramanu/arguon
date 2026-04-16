import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';
import type { PostPreview, PostDetail, CommentItem, ReactionType, ReactionCounts, UserListItem } from './api.types';

interface FeedResponse {
  posts: PostPreview[];
  next_cursor: string | null;
}

interface PostDetailResponse {
  data: PostDetail;
}

interface CommentsResponse {
  comments: CommentItem[];
  next_cursor: string | null;
}

interface ScoresResponse {
  scores: Array<{
    post_id: string;
    confidence_score: number;
    confidence_label: string;
    confidence_color: string;
  }>;
}

@Injectable({ providedIn: 'root' })
export class FeedService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  private readonly _posts = signal<PostPreview[]>([]);
  private readonly _loading = signal(false);
  private readonly _cursor = signal<string | null>(null);
  private readonly _error = signal<string | null>(null);

  readonly posts = this._posts.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly hasMore = computed(() => this._cursor() !== null);
  readonly error = this._error.asReadonly();

  loadFeed(options?: {
    tag?: string;
    region?: string;
    following?: boolean;
    sort?: string;
    reset?: boolean;
  }): void {
    if (this._loading()) return;

    const reset = options?.reset ?? true;
    if (reset) {
      this._posts.set([]);
      this._cursor.set(null);
    }

    this._loading.set(true);
    this._error.set(null);

    let params = new HttpParams().set('limit', '20');
    if (options?.tag) params = params.set('tag', options.tag);
    if (options?.region) params = params.set('region', options.region);
    if (options?.following) params = params.set('following', 'true');
    if (options?.sort) params = params.set('sort', options.sort);
    if (!reset && this._cursor()) params = params.set('cursor', this._cursor()!);

    this.http.get<FeedResponse>(`${this.baseUrl}/feed`, { params }).subscribe({
      next: (res) => {
        this._posts.update((prev) => reset ? res.posts : [...prev, ...res.posts]);
        this._cursor.set(res.next_cursor);
        this._loading.set(false);
      },
      error: () => {
        this._error.set('Failed to load feed');
        this._loading.set(false);
      },
    });
  }

  loadMore(options?: { tag?: string; region?: string; following?: boolean; sort?: string }): void {
    if (!this.hasMore() || this._loading()) return;
    this.loadFeed({ ...options, reset: false });
  }

  getPost(id: string) {
    return this.http.get<PostDetailResponse>(`${this.baseUrl}/posts/${encodeURIComponent(id)}`);
  }

  getComments(postId: string, cursor?: string) {
    let params = new HttpParams().set('limit', '20');
    if (cursor) params = params.set('cursor', cursor);
    return this.http.get<CommentsResponse>(
      `${this.baseUrl}/posts/${encodeURIComponent(postId)}/comments`,
      { params },
    );
  }

  getScoreUpdates(since: string) {
    const params = new HttpParams().set('since', since);
    return this.http.get<ScoresResponse>(`${this.baseUrl}/feed/scores`, { params });
  }

  updateScores(scores: ScoresResponse['scores']): void {
    this._posts.update((posts) =>
      posts.map((post) => {
        const updated = scores.find((s) => s.post_id === post.id);
        if (!updated) return post;
        return {
          ...post,
          confidence_score: updated.confidence_score,
          confidence_label: updated.confidence_label,
          confidence_color: updated.confidence_color,
        };
      }),
    );
  }

  // --- Reactions ---

  addReaction(targetType: 'posts' | 'comments', targetId: string, reactionType: ReactionType) {
    return this.http.post<{ reaction_counts: ReactionCounts }>(
      `${this.baseUrl}/${targetType}/${encodeURIComponent(targetId)}/reactions`,
      { reaction_type: reactionType },
    );
  }

  removeReaction(targetType: 'posts' | 'comments', targetId: string) {
    return this.http.delete<{ reaction_counts: ReactionCounts }>(
      `${this.baseUrl}/${targetType}/${encodeURIComponent(targetId)}/reactions`,
    );
  }

  /** Apply optimistic reaction update to the feed posts signal. */
  updatePostReaction(postId: string, reactionCounts: ReactionCounts, userReaction: ReactionType | null): void {
    this._posts.update((posts) =>
      posts.map((p) =>
        p.id === postId ? { ...p, reaction_counts: reactionCounts, user_reaction: userReaction } : p,
      ),
    );
  }

  // --- Impressions ---

  reportImpressions(impressions: Array<{ post_id: string; dwell_ms: number }>) {
    return this.http.post<{ recorded: number }>(
      `${this.baseUrl}/feed/impressions`,
      { impressions },
    );
  }

  // --- Comments ---

  addComment(postId: string, content: string, parentCommentId?: string) {
    return this.http.post<{ data: CommentItem }>(
      `${this.baseUrl}/posts/${encodeURIComponent(postId)}/comments`,
      { content, parent_comment_id: parentCommentId ?? null },
    );
  }

  // --- Follows ---

  followUser(handle: string) {
    return this.http.post<{ data: { is_following: boolean; follower_count: number; following_count: number } }>(
      `${this.baseUrl}/users/${encodeURIComponent(handle)}/follow`,
      {},
    );
  }

  unfollowUser(handle: string) {
    return this.http.delete<{ data: { is_following: boolean; follower_count: number; following_count: number } }>(
      `${this.baseUrl}/users/${encodeURIComponent(handle)}/follow`,
    );
  }

  getFollowers(handle: string, cursor?: string) {
    let params = new HttpParams().set('limit', '20');
    if (cursor) params = params.set('cursor', cursor);
    return this.http.get<{
      users: UserListItem[];
      follower_count: number;
      following_count: number;
      next_cursor: string | null;
    }>(`${this.baseUrl}/users/${encodeURIComponent(handle)}/followers`, { params });
  }

  getFollowingList(handle: string, cursor?: string) {
    let params = new HttpParams().set('limit', '20');
    if (cursor) params = params.set('cursor', cursor);
    return this.http.get<{
      users: UserListItem[];
      follower_count: number;
      following_count: number;
      next_cursor: string | null;
    }>(`${this.baseUrl}/users/${encodeURIComponent(handle)}/following`, { params });
  }

  getUserPosts(handle: string, cursor?: string) {
    let params = new HttpParams().set('limit', '20');
    if (cursor) params = params.set('cursor', cursor);
    return this.http.get<FeedResponse>(
      `${this.baseUrl}/users/${encodeURIComponent(handle)}/posts`,
      { params },
    );
  }
}

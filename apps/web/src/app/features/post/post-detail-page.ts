import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  signal,
  computed,
  OnInit,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NgpAvatar, NgpAvatarImage, NgpAvatarFallback } from 'ng-primitives/avatar';
import { NgpButton } from 'ng-primitives/button';
import { NgpTextarea } from 'ng-primitives/textarea';
import { FeedService } from '../../core/feed.service';
import { ConfidenceBadge } from '../../shared/confidence-badge/confidence-badge';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import type { PostDetail, CommentItem, ReactionType, ReactionCounts } from '../../core/api.types';

@Component({
  selector: 'app-post-detail-page',
  imports: [RouterLink, NgpAvatar, NgpAvatarImage, NgpAvatarFallback, NgpButton, NgpTextarea, ConfidenceBadge, RelativeTimePipe, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './post-detail-page.html',
  styleUrl: './post-detail-page.scss',
})
export class PostDetailPage implements OnInit {
  readonly id = input.required<string>();

  private readonly feedService = inject(FeedService);

  protected readonly post = signal<PostDetail | null>(null);
  protected readonly comments = signal<CommentItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly commentsCursor = signal<string | null>(null);
  protected readonly commentsLoading = signal(false);

  protected readonly commentText = signal('');
  protected readonly commentSubmitting = signal(false);
  protected readonly commentError = signal<string | null>(null);
  protected readonly replyingTo = signal<string | null>(null);
  protected readonly replyText = signal('');

  protected readonly charCount = computed(() => this.commentText().length);
  protected readonly replyCharCount = computed(() => this.replyText().length);

  ngOnInit(): void {
    this.feedService.getPost(this.id()).subscribe({
      next: (res) => {
        this.post.set(res.data);
        this.loading.set(false);
        this.loadComments();
      },
      error: () => {
        this.error.set('Failed to load post');
        this.loading.set(false);
      },
    });
  }

  protected toggleReaction(type: ReactionType): void {
    const p = this.post();
    if (!p) return;

    const isRemoving = p.user_reaction === type;

    // Optimistic update
    const oldCounts = { ...p.reaction_counts };
    const newCounts = { ...oldCounts };

    if (p.user_reaction) {
      newCounts[p.user_reaction] = Math.max(0, newCounts[p.user_reaction] - 1);
    }
    if (!isRemoving) {
      newCounts[type] = newCounts[type] + 1;
    }

    this.post.set({
      ...p,
      reaction_counts: newCounts,
      user_reaction: isRemoving ? null : type,
    });

    const request$ = isRemoving
      ? this.feedService.removeReaction('posts', p.id)
      : this.feedService.addReaction('posts', p.id, type);

    request$.subscribe({
      next: (res) => {
        this.post.update((current) =>
          current ? { ...current, reaction_counts: res.reaction_counts } : current,
        );
      },
      error: () => {
        // Revert
        this.post.update((current) =>
          current ? { ...current, reaction_counts: oldCounts, user_reaction: p.user_reaction } : current,
        );
      },
    });
  }

  protected isReactionActive(type: ReactionType): boolean {
    return this.post()?.user_reaction === type;
  }

  protected submitComment(): void {
    const content = this.commentText().trim();
    if (!content || content.length > 300 || this.commentSubmitting()) return;

    this.commentSubmitting.set(true);
    this.commentError.set(null);

    this.feedService.addComment(this.id(), content).subscribe({
      next: (res) => {
        this.comments.update((prev) => [...prev, res.data]);
        this.commentText.set('');
        this.commentSubmitting.set(false);
        this.post.update((p) => p ? { ...p, comment_count: p.comment_count + 1 } : p);
      },
      error: (err) => {
        const message = err?.error?.error?.message ?? 'Failed to post comment';
        this.commentError.set(message);
        this.commentSubmitting.set(false);
      },
    });
  }

  protected startReply(commentId: string): void {
    this.replyingTo.set(commentId);
    this.replyText.set('');
  }

  protected cancelReply(): void {
    this.replyingTo.set(null);
    this.replyText.set('');
  }

  protected submitReply(parentCommentId: string): void {
    const content = this.replyText().trim();
    if (!content || content.length > 300 || this.commentSubmitting()) return;

    this.commentSubmitting.set(true);
    this.commentError.set(null);

    this.feedService.addComment(this.id(), content, parentCommentId).subscribe({
      next: (res) => {
        this.comments.update((prev) =>
          prev.map((c) =>
            c.id === parentCommentId
              ? { ...c, replies: [...(c.replies ?? []), res.data] }
              : c,
          ),
        );
        this.replyingTo.set(null);
        this.replyText.set('');
        this.commentSubmitting.set(false);
        this.post.update((p) => p ? { ...p, comment_count: p.comment_count + 1 } : p);
      },
      error: (err) => {
        const message = err?.error?.error?.message ?? 'Failed to post reply';
        this.commentError.set(message);
        this.commentSubmitting.set(false);
      },
    });
  }

  protected loadMoreComments(): void {
    if (!this.commentsCursor() || this.commentsLoading()) return;
    this.loadComments(this.commentsCursor()!);
  }

  private loadComments(cursor?: string): void {
    this.commentsLoading.set(true);
    this.feedService.getComments(this.id(), cursor).subscribe({
      next: (res) => {
        this.comments.update((prev) => cursor ? [...prev, ...res.comments] : res.comments);
        this.commentsCursor.set(res.next_cursor);
        this.commentsLoading.set(false);
      },
      error: () => {
        this.commentsLoading.set(false);
      },
    });
  }
}

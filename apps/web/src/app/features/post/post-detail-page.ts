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
  template: `
    @if (loading()) {
      <div class="text-center py-12" aria-label="Loading post">
        <div class="spinner mx-auto"></div>
      </div>
    } @else if (error()) {
      <div class="max-w-[720px] mx-auto my-8 p-4 text-center text-error bg-error-bg border border-error-border rounded-lg" role="alert">{{ error() }}</div>
    } @else if (post(); as p) {
      <article class="max-w-[720px] mx-auto">
        <header class="flex items-start gap-3 mb-5">
          @if (p.agent) {
            <a [routerLink]="['/u', p.agent.handle]" class="shrink-0">
              <span ngpAvatar class="w-12 h-12 rounded-full overflow-hidden inline-block">
                @if (p.agent.avatar_url) {
                  <img ngpAvatarImage [src]="p.agent.avatar_url" [alt]="p.agent.name" class="w-full h-full object-cover" />
                }
                <span ngpAvatarFallback class="flex items-center justify-center w-full h-full bg-surface-alt text-text-muted font-semibold text-lg">
                  {{ p.agent.name.charAt(0) }}
                </span>
              </span>
            </a>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5">
                <a [routerLink]="['/u', p.agent.handle]" class="font-semibold text-text hover:underline">{{ p.agent.name }}</a>
                @if (p.agent.is_verified_ai) {
                  <span class="text-sm" title="Verified AI Agent">⚡</span>
                }
              </div>
              <span class="text-[0.8125rem] text-text-muted">&#64;{{ p.agent.handle }}</span>
            </div>
          }
          <div class="flex flex-col items-end gap-1 shrink-0">
            <app-confidence-badge [score]="p.confidence_score" [label]="p.confidence_label" />
            <time [attr.datetime]="p.created_at" class="text-xs text-text-faint">{{ p.created_at | relativeTime }}</time>
          </div>
        </header>

        <h1 class="text-2xl font-bold leading-snug text-text mb-3">{{ p.headline }}</h1>
        <p class="text-base leading-relaxed text-text-secondary mb-4">{{ p.summary }}</p>

        @if (p.tags.length > 0) {
          <div class="flex flex-wrap gap-1.5 mb-4">
            @for (tag of p.tags; track tag) {
              <span class="text-[0.8125rem] text-tag bg-tag-bg px-2 py-0.5 rounded-full">#{{ tag }}</span>
            }
          </div>
        }

        @if (p.sources.length > 0) {
          <div class="my-5 p-4 bg-surface-hover rounded-lg">
            <h3 class="text-sm font-semibold text-text-secondary mb-2">Sources</h3>
            <ul class="pl-5">
              @for (source of p.sources; track source.url) {
                <li class="mb-1.5">
                  <a [href]="source.url" target="_blank" rel="noopener noreferrer" class="text-sm text-primary hover:underline">
                    {{ source.title || source.url }}
                  </a>
                </li>
              }
            </ul>
          </div>
        }

        <div class="flex gap-5 py-4 border-y border-border text-[0.9375rem] text-text-secondary">
          <button ngpButton [class.text-primary]="isReactionActive('agree')" (click)="toggleReaction('agree')" type="button" class="data-[press]:scale-95">👍 {{ p.reaction_counts.agree }}</button>
          <button ngpButton [class.text-primary]="isReactionActive('interesting')" (click)="toggleReaction('interesting')" type="button" class="data-[press]:scale-95">💡 {{ p.reaction_counts.interesting }}</button>
          <button ngpButton [class.text-primary]="isReactionActive('doubtful')" (click)="toggleReaction('doubtful')" type="button" class="data-[press]:scale-95">🤔 {{ p.reaction_counts.doubtful }}</button>
          <button ngpButton [class.text-primary]="isReactionActive('insightful')" (click)="toggleReaction('insightful')" type="button" class="data-[press]:scale-95">🔍 {{ p.reaction_counts.insightful }}</button>
        </div>
      </article>

      <section class="max-w-[720px] mx-auto mt-6">
        <h2 class="text-lg font-semibold mb-4">Comments ({{ p.comment_count }})</h2>

        <div class="mb-4">
          @if (commentError()) {
            <div class="text-sm text-error bg-error-bg border border-error-border rounded-md p-2 mb-2" role="alert">{{ commentError() }}</div>
          }
          <textarea
            ngpTextarea
            class="w-full px-3 py-2 border border-border rounded-lg text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/30 data-[focus]:border-primary"
            placeholder="Write a comment..."
            [ngModel]="commentText()"
            (ngModelChange)="commentText.set($event)"
            [maxlength]="300"
            rows="3"
          ></textarea>
          <div class="flex items-center justify-end gap-3 mt-2">
            <span class="text-xs" [class.text-error]="charCount() >= 280" [class.text-text-faint]="charCount() < 280">{{ charCount() }}/300</span>
            <button
              ngpButton
              class="px-4 py-1.5 bg-primary text-white text-sm font-medium rounded-md data-[hover]:bg-primary-hover data-[disabled]:opacity-60"
              [disabled]="charCount() === 0 || charCount() > 300 || commentSubmitting()"
              (click)="submitComment()"
              type="button"
            >{{ commentSubmitting() ? 'Posting...' : 'Post comment' }}</button>
          </div>
        </div>

        @for (comment of comments(); track comment.id) {
          <div class="py-3 border-b border-border-light">
            <div class="flex items-center gap-2 mb-1.5">
              <a [routerLink]="['/u', comment.user.handle]" class="font-semibold text-sm text-text hover:underline">{{ comment.user.name }}</a>
              @if (comment.user.is_ai) {
                <span class="text-[0.6875rem] px-1.5 py-0.5 rounded bg-ai-bg text-ai font-semibold">AI</span>
              }
              <time class="text-xs text-text-faint">{{ comment.created_at | relativeTime }}</time>
            </div>
            <p class="text-[0.9375rem] leading-normal text-text-secondary">{{ comment.content }}</p>
            <div class="mt-1">
              <button ngpButton class="text-sm text-text-muted hover:text-text" (click)="startReply(comment.id)" type="button">Reply</button>
            </div>

            @if (replyingTo() === comment.id) {
              <div class="mt-2 ml-4">
                <textarea
                  ngpTextarea
                  class="w-full px-3 py-2 border border-border rounded-lg text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/30 data-[focus]:border-primary"
                  placeholder="Write a reply..."
                  [ngModel]="replyText()"
                  (ngModelChange)="replyText.set($event)"
                  [maxlength]="300"
                  rows="2"
                ></textarea>
                <div class="flex items-center justify-end gap-3 mt-2">
                  <span class="text-xs" [class.text-error]="replyCharCount() >= 280" [class.text-text-faint]="replyCharCount() < 280">{{ replyCharCount() }}/300</span>
                  <button ngpButton class="text-sm text-text-muted hover:text-text" (click)="cancelReply()" type="button">Cancel</button>
                  <button
                    ngpButton
                    class="px-4 py-1.5 bg-primary text-white text-sm font-medium rounded-md data-[hover]:bg-primary-hover data-[disabled]:opacity-60"
                    [disabled]="replyCharCount() === 0 || replyCharCount() > 300 || commentSubmitting()"
                    (click)="submitReply(comment.id)"
                    type="button"
                  >{{ commentSubmitting() ? 'Posting...' : 'Reply' }}</button>
                </div>
              </div>
            }

            @if (comment.replies && comment.replies.length > 0) {
              <div class="ml-6 pl-4 border-l-2 border-border mt-2">
                @for (reply of comment.replies; track reply.id) {
                  <div class="py-2">
                    <div class="flex items-center gap-2 mb-1">
                      <a [routerLink]="['/u', reply.user.handle]" class="font-semibold text-sm text-text hover:underline">{{ reply.user.name }}</a>
                      @if (reply.user.is_ai) {
                        <span class="text-[0.6875rem] px-1.5 py-0.5 rounded bg-ai-bg text-ai font-semibold">AI</span>
                      }
                      <time class="text-xs text-text-faint">{{ reply.created_at | relativeTime }}</time>
                    </div>
                    <p class="text-[0.9375rem] leading-normal text-text-secondary">{{ reply.content }}</p>
                  </div>
                }
              </div>
            }
          </div>
        } @empty {
          @if (!commentsLoading()) {
            <p class="text-center text-text-faint py-8">No comments yet.</p>
          }
        }

        @if (commentsLoading()) {
          <div class="flex justify-center py-6">
            <div class="spinner"></div>
          </div>
        }

        @if (commentsCursor() && !commentsLoading()) {
          <button ngpButton class="w-full py-2.5 mt-3 border border-border rounded-lg bg-white text-text-secondary text-sm text-center hover:bg-surface-hover" (click)="loadMoreComments()">
            Load more comments
          </button>
        }
      </section>
    }
  `,
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

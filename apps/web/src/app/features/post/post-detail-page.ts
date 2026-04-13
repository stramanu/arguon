import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  signal,
  OnInit,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { FeedService } from '../../core/feed.service';
import { ConfidenceBadge } from '../../shared/confidence-badge/confidence-badge';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import type { PostDetail, CommentItem } from '../../core/api.types';

@Component({
  selector: 'app-post-detail-page',
  imports: [RouterLink, ConfidenceBadge, RelativeTimePipe],
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

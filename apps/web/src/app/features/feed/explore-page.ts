import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { NgpButton } from 'ng-primitives/button';
import { NgpToggle } from 'ng-primitives/toggle';
import { FeedService } from '../../core/feed.service';
import { PostCard } from '../../shared/post-card/post-card';
import type { ReactionType } from '../../core/api.types';

const TOPIC_CHIPS = [
  'technology', 'politics', 'science', 'economics',
  'health', 'environment', 'culture', 'sports',
];

@Component({
  selector: 'app-explore-page',
  imports: [PostCard, NgpButton, NgpToggle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="max-w-[680px] mx-auto">
      <h1 class="text-2xl font-bold mb-4">Explore</h1>

      <div class="flex flex-col gap-3 mb-4">
        <div class="flex flex-wrap gap-2" role="group" aria-label="Filter by topic">
          @for (topic of topics; track topic) {
            <button
              ngpToggle
              [ngpToggleSelected]="activeTopic() === topic"
              (ngpToggleSelectedChange)="selectTopic(topic)"
              class="px-3 py-1.5 text-[0.8125rem] border border-border rounded-full bg-white text-text-secondary cursor-pointer transition-colors
                     hover:bg-surface-alt data-[selected]:bg-primary data-[selected]:text-white data-[selected]:border-primary"
            >{{ topic }}</button>
          }
        </div>

        <div class="flex gap-2" role="group" aria-label="Sort order">
          <button
            ngpButton
            class="px-3 py-1.5 text-[0.8125rem] border border-border rounded-md bg-white text-text-muted hover:bg-surface-hover"
            [class.!bg-text]="activeSort() === 'recent'"
            [class.!text-white]="activeSort() === 'recent'"
            [class.!border-text]="activeSort() === 'recent'"
            (click)="setSort('recent')"
          >Recent</button>
          <button
            ngpButton
            class="px-3 py-1.5 text-[0.8125rem] border border-border rounded-md bg-white text-text-muted hover:bg-surface-hover"
            [class.!bg-text]="activeSort() === 'confidence'"
            [class.!text-white]="activeSort() === 'confidence'"
            [class.!border-text]="activeSort() === 'confidence'"
            (click)="setSort('confidence')"
          >Top Confidence</button>
        </div>
      </div>

      @if (feed.error()) {
        <div class="p-4 bg-error-bg border border-error-border rounded-lg text-error text-center mb-4" role="alert">
          {{ feed.error() }}
        </div>
      }

      <div class="flex flex-col gap-3">
        @for (post of feed.posts(); track post.id) {
          <app-post-card [post]="post" (reactionToggled)="handleReaction($event)" />
        } @empty {
          @if (!feed.loading()) {
            <p class="text-center text-text-faint py-12 text-[0.9375rem]">No posts found.</p>
          }
        }
      </div>

      @if (feed.loading()) {
        <div class="flex justify-center py-8" aria-label="Loading posts">
          <div class="spinner"></div>
        </div>
      }

      @if (feed.hasMore() && !feed.loading()) {
        <div class="flex justify-center py-4">
          <button ngpButton class="px-6 py-2 border border-border rounded-lg bg-white text-text-secondary text-sm hover:bg-surface-hover" (click)="loadMore()">Load more</button>
        </div>
      }
    </div>
  `,
})
export class ExplorePage implements OnInit {
  protected readonly feed = inject(FeedService);

  protected readonly topics = TOPIC_CHIPS;
  protected readonly activeTopic = signal<string | null>(null);
  protected readonly activeSort = signal<'recent' | 'confidence'>('recent');

  ngOnInit(): void {
    this.loadExplore();
  }

  protected selectTopic(topic: string | null): void {
    this.activeTopic.set(topic === this.activeTopic() ? null : topic);
    this.loadExplore();
  }

  protected setSort(sort: 'recent' | 'confidence'): void {
    this.activeSort.set(sort);
    this.loadExplore();
  }

  protected loadMore(): void {
    this.feed.loadMore({
      tag: this.activeTopic() ?? undefined,
      sort: this.activeSort(),
    });
  }

  private loadExplore(): void {
    this.feed.loadFeed({
      tag: this.activeTopic() ?? undefined,
      sort: this.activeSort(),
      reset: true,
    });
  }

  protected handleReaction(event: { postId: string; type: ReactionType }): void {
    const posts = this.feed.posts();
    const post = posts.find((p) => p.id === event.postId);
    if (!post) return;

    const isRemoving = post.user_reaction === event.type;
    const oldCounts = { ...post.reaction_counts };
    const newCounts = { ...oldCounts };

    if (post.user_reaction) {
      newCounts[post.user_reaction] = Math.max(0, newCounts[post.user_reaction] - 1);
    }
    if (!isRemoving) {
      newCounts[event.type] = newCounts[event.type] + 1;
    }
    this.feed.updatePostReaction(event.postId, newCounts, isRemoving ? null : event.type);

    const request$ = isRemoving
      ? this.feed.removeReaction('posts', event.postId)
      : this.feed.addReaction('posts', event.postId, event.type);

    request$.subscribe({
      next: (res) => {
        this.feed.updatePostReaction(event.postId, res.reaction_counts, isRemoving ? null : event.type);
      },
      error: () => {
        this.feed.updatePostReaction(event.postId, oldCounts, post.user_reaction);
      },
    });
  }
}

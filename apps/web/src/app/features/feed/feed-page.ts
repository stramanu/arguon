import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  OnDestroy,
  signal,
} from '@angular/core';
import { NgpTabset, NgpTabList, NgpTabButton, NgpTabPanel } from 'ng-primitives/tabs';
import { NgpButton } from 'ng-primitives/button';
import { FeedService } from '../../core/feed.service';
import { AuthService } from '../../core/auth.service';
import { PostCard } from '../../shared/post-card/post-card';
import type { ReactionType } from '../../core/api.types';

@Component({
  selector: 'app-feed-page',
  imports: [PostCard, NgpTabset, NgpTabList, NgpTabButton, NgpTabPanel, NgpButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="max-w-[680px] mx-auto">
      <div ngpTabset [ngpTabsetValue]="activeTab()" (ngpTabsetValueChange)="switchTab($event === 'following' ? 'following' : 'foryou')">
        <div ngpTabList class="flex border-b border-border mb-4">
          <button
            ngpTabButton ngpTabButtonValue="foryou"
            class="flex-1 px-4 py-3 text-[0.9375rem] font-medium text-text-muted border-b-2 border-transparent transition-colors
                   data-[active]:text-text data-[active]:font-semibold data-[active]:border-text hover:text-text"
          >For You</button>
          @if (auth.isSignedIn()) {
            <button
              ngpTabButton ngpTabButtonValue="following"
              class="flex-1 px-4 py-3 text-[0.9375rem] font-medium text-text-muted border-b-2 border-transparent transition-colors
                     data-[active]:text-text data-[active]:font-semibold data-[active]:border-text hover:text-text"
            >Following</button>
          }
        </div>

        <div ngpTabPanel ngpTabPanelValue="foryou"></div>
        @if (auth.isSignedIn()) {
          <div ngpTabPanel ngpTabPanelValue="following"></div>
        }
      </div>

      @if (feed.error()) {
        <div class="p-4 bg-error-bg border border-error-border rounded-lg text-error text-center mb-4" role="alert">
          {{ feed.error() }}
          <button ngpButton class="mt-2 px-4 py-1.5 border border-error rounded-md text-error hover:bg-error hover:text-white" (click)="switchTab(activeTab())">Retry</button>
        </div>
      }

      <div class="flex flex-col gap-3">
        @for (post of feed.posts(); track post.id) {
          <app-post-card [post]="post" (reactionToggled)="handleReaction($event)" />
        } @empty {
          @if (!feed.loading()) {
            <p class="text-center text-text-faint py-12 text-[0.9375rem]">No posts yet.</p>
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
          <button ngpButton class="px-6 py-2 border border-border rounded-lg bg-surface text-text-secondary text-sm hover:bg-surface-hover" (click)="loadMore()">Load more</button>
        </div>
      }
    </div>
  `,
})
export class FeedPage implements OnInit, OnDestroy {
  protected readonly feed = inject(FeedService);
  protected readonly auth = inject(AuthService);
  protected readonly activeTab = signal<'foryou' | 'following'>('foryou');

  private scoreInterval: ReturnType<typeof setInterval> | null = null;
  private lastScoreCheck: string | null = null;

  ngOnInit(): void {
    this.loadTab('foryou');
    this.startScorePolling();
  }

  ngOnDestroy(): void {
    this.stopScorePolling();
  }

  protected switchTab(tab: 'foryou' | 'following'): void {
    this.activeTab.set(tab);
    this.loadTab(tab);
  }

  protected loadMore(): void {
    this.feed.loadMore({
      following: this.activeTab() === 'following',
    });
  }

  protected handleReaction(event: { postId: string; type: ReactionType }): void {
    const posts = this.feed.posts();
    const post = posts.find((p) => p.id === event.postId);
    if (!post) return;

    const isRemoving = post.user_reaction === event.type;
    const oldCounts = { ...post.reaction_counts };

    // Optimistic update
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
        // Revert
        this.feed.updatePostReaction(event.postId, oldCounts, post.user_reaction);
      },
    });
  }

  private loadTab(tab: 'foryou' | 'following'): void {
    this.lastScoreCheck = new Date().toISOString();
    this.feed.loadFeed({
      following: tab === 'following',
      reset: true,
    });
  }

  private startScorePolling(): void {
    this.scoreInterval = setInterval(() => {
      if (!this.lastScoreCheck) return;
      this.feed.getScoreUpdates(this.lastScoreCheck).subscribe({
        next: (res) => {
          if (res.scores.length > 0) {
            this.feed.updateScores(res.scores);
          }
          this.lastScoreCheck = new Date().toISOString();
        },
      });
    }, 120_000);
  }

  private stopScorePolling(): void {
    if (this.scoreInterval) {
      clearInterval(this.scoreInterval);
      this.scoreInterval = null;
    }
  }
}

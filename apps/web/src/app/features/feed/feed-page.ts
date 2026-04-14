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
  templateUrl: './feed-page.html',
  styleUrl: './feed-page.scss',
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

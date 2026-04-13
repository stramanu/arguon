import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  OnDestroy,
  signal,
} from '@angular/core';
import { FeedService } from '../../core/feed.service';
import { AuthService } from '../../core/auth.service';
import { PostCard } from '../../shared/post-card/post-card';

@Component({
  selector: 'app-feed-page',
  imports: [PostCard],
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

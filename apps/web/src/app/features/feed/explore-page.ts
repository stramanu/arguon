import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FeedService } from '../../core/feed.service';
import { PostCard } from '../../shared/post-card/post-card';

const TOPIC_CHIPS = [
  'technology', 'politics', 'science', 'economics',
  'health', 'environment', 'culture', 'sports',
];

@Component({
  selector: 'app-explore-page',
  imports: [PostCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './explore-page.html',
  styleUrl: './explore-page.scss',
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
}

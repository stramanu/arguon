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

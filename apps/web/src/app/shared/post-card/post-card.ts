import { ChangeDetectionStrategy, Component, input, computed, inject, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { PostPreview, ReactionType } from '../../core/api.types';
import { ConfidenceBadge } from '../confidence-badge/confidence-badge';
import { RelativeTimePipe } from '../pipes/relative-time.pipe';

@Component({
  selector: 'app-post-card',
  imports: [RouterLink, ConfidenceBadge, RelativeTimePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './post-card.html',
  styleUrl: './post-card.scss',
})
export class PostCard {
  readonly post = input.required<PostPreview>();
  readonly reactionToggled = output<{ postId: string; type: ReactionType }>();

  protected readonly totalReactions = computed(() => {
    const r = this.post().reaction_counts;
    return r.agree + r.interesting + r.doubtful + r.insightful;
  });

  protected toggleReaction(type: ReactionType): void {
    this.reactionToggled.emit({ postId: this.post().id, type });
  }

  protected isActive(type: ReactionType): boolean {
    return this.post().user_reaction === type;
  }
}

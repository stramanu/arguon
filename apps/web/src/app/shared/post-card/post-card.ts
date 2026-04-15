import { ChangeDetectionStrategy, Component, input, computed, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgpAvatar, NgpAvatarImage, NgpAvatarFallback } from 'ng-primitives/avatar';
import { NgpButton } from 'ng-primitives/button';
import type { PostPreview, ReactionType } from '../../core/api.types';
import { ConfidenceBadge } from '../confidence-badge/confidence-badge';
import { RelativeTimePipe } from '../pipes/relative-time.pipe';

@Component({
  selector: 'app-post-card',
  imports: [RouterLink, NgpAvatar, NgpAvatarImage, NgpAvatarFallback, NgpButton, ConfidenceBadge, RelativeTimePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './post-card.html',
  styleUrl: './post-card.scss',
})
export class PostCard {
  readonly post = input.required<PostPreview>();
  readonly isSignedIn = input(true);
  readonly reactionToggled = output<{ postId: string; type: ReactionType }>();

  protected readonly totalReactions = computed(() => {
    const r = this.post().reaction_counts;
    return r.agree + r.interesting + r.doubtful + r.insightful;
  });

  protected toggleReaction(type: ReactionType): void {
    if (!this.isSignedIn()) return;
    this.reactionToggled.emit({ postId: this.post().id, type });
  }

  protected isActive(type: ReactionType): boolean {
    return this.post().user_reaction === type;
  }
}

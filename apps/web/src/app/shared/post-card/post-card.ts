import { ChangeDetectionStrategy, Component, input, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { PostPreview } from '../../core/api.types';
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

  protected readonly totalReactions = computed(() => {
    const r = this.post().reaction_counts;
    return r.agree + r.interesting + r.doubtful + r.insightful;
  });
}

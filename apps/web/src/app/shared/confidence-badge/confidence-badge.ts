import { ChangeDetectionStrategy, Component, input, computed } from '@angular/core';

@Component({
  selector: 'app-confidence-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './confidence-badge.html',
  styleUrl: './confidence-badge.scss',
})
export class ConfidenceBadge {
  readonly score = input.required<number>();
  readonly label = input.required<string>();

  protected readonly badgeClasses = computed(() => {
    const base = 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold leading-5';
    const s = this.score();
    if (s >= 90) return `${base} bg-green-100 text-green-800`;
    if (s >= 70) return `${base} bg-yellow-100 text-yellow-800`;
    if (s >= 50) return `${base} bg-orange-100 text-orange-800`;
    return `${base} bg-red-100 text-red-800`;
  });
}

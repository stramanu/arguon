import { ChangeDetectionStrategy, Component, input, computed } from '@angular/core';

@Component({
  selector: 'app-confidence-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="badge" [class]="'badge--' + color()">
      {{ label() }}
    </span>
  `,
  styles: `
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 0.125rem 0.5rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      line-height: 1.25rem;
    }
    .badge--green {
      background-color: #dcfce7;
      color: #166534;
    }
    .badge--yellow {
      background-color: #fef9c3;
      color: #854d0e;
    }
    .badge--orange {
      background-color: #ffedd5;
      color: #9a3412;
    }
    .badge--red {
      background-color: #fee2e2;
      color: #991b1b;
    }
  `,
})
export class ConfidenceBadge {
  readonly score = input.required<number>();
  readonly label = input.required<string>();

  protected readonly color = computed(() => {
    const s = this.score();
    if (s >= 90) return 'green';
    if (s >= 70) return 'yellow';
    if (s >= 50) return 'orange';
    return 'red';
  });
}

import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';

const TOPICS = [
  { id: 'geopolitics', label: 'Geopolitics', icon: '🌍' },
  { id: 'technology', label: 'Technology', icon: '💻' },
  { id: 'ai', label: 'AI', icon: '🤖' },
  { id: 'science', label: 'Science', icon: '🔬' },
  { id: 'health', label: 'Health', icon: '🏥' },
  { id: 'economy', label: 'Economy', icon: '📈' },
  { id: 'culture', label: 'Culture', icon: '🎭' },
  { id: 'sports', label: 'Sports', icon: '⚽' },
  { id: 'environment', label: 'Environment', icon: '🌱' },
  { id: 'education', label: 'Education', icon: '📚' },
  { id: 'security', label: 'Security', icon: '🔒' },
] as const;

@Component({
  selector: 'app-topic-selector',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './topic-selector.html',
  styleUrl: './topic-selector.scss',
})
export class TopicSelectorComponent {
  readonly selectedTopics = input<string[]>([]);
  readonly topicsChange = output<string[]>();

  protected readonly topics = TOPICS;

  protected isSelected(topicId: string): boolean {
    return this.selectedTopics().includes(topicId);
  }

  protected toggle(topicId: string): void {
    const current = this.selectedTopics();
    const next = current.includes(topicId)
      ? current.filter((t) => t !== topicId)
      : [...current, topicId];
    this.topicsChange.emit(next);
  }
}

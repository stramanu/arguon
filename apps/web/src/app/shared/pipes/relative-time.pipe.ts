import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'relativeTime' })
export class RelativeTimePipe implements PipeTransform {
  transform(value: string | null): string {
    if (!value) return '';
    const date = new Date(value);
    const now = Date.now();
    const diff = now - date.getTime();

    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return 'just now';

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;

    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

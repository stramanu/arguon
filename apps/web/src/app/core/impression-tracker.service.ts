import { Injectable, OnDestroy, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FeedService } from './feed.service';
import { AuthService } from './auth.service';

/**
 * Tracks which posts appear in the viewport and batch-reports impressions
 * to the API every 5 seconds. Uses a single shared IntersectionObserver.
 */
@Injectable({ providedIn: 'root' })
export class ImpressionTrackerService implements OnDestroy {
  private readonly feed = inject(FeedService);
  private readonly auth = inject(AuthService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private observer: IntersectionObserver | null = null;
  private readonly elementMap = new Map<Element, string>();
  private readonly buffer = new Set<string>();
  private readonly reported = new Set<string>();
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  track(element: Element, postId: string): void {
    if (!this.isBrowser || !this.auth.isSignedIn()) return;
    this.ensureObserver();
    this.elementMap.set(element, postId);
    this.observer!.observe(element);
  }

  untrack(element: Element): void {
    this.observer?.unobserve(element);
    this.elementMap.delete(element);
  }

  /** Clear reported-set when the feed context changes (e.g. tab switch). */
  reset(): void {
    this.reported.clear();
    this.buffer.clear();
  }

  /** Send any buffered impressions immediately. */
  flush(): void {
    if (this.buffer.size === 0) return;
    const ids = [...this.buffer];
    this.buffer.clear();
    ids.forEach((id) => this.reported.add(id));
    this.feed.reportImpressions(ids).subscribe();
  }

  ngOnDestroy(): void {
    this.flush();
    this.observer?.disconnect();
    if (this.flushTimer) clearInterval(this.flushTimer);
  }

  private ensureObserver(): void {
    if (this.observer) return;

    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const postId = this.elementMap.get(entry.target);
          if (postId && !this.reported.has(postId)) {
            this.buffer.add(postId);
          }
        }
      },
      { threshold: 0.5 },
    );

    this.flushTimer = setInterval(() => this.flush(), 5_000);

    // Flush remaining impressions when the user navigates away
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flush();
    });
  }
}

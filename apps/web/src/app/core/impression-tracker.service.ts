import { Injectable, OnDestroy, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FeedService } from './feed.service';
import { AuthService } from './auth.service';
import { CookieConsentService } from './cookie-consent.service';

/**
 * Tracks which posts appear in the viewport and batch-reports impressions
 * (with dwell time) to the API every 5 seconds. Uses a single IntersectionObserver.
 * Requires ≥ 1 s of continuous ≥ 50 % visibility before counting a post as "seen".
 * Accumulates total dwell time per post and sends it with each flush.
 */
@Injectable({ providedIn: 'root' })
export class ImpressionTrackerService implements OnDestroy {
  private readonly feed = inject(FeedService);
  private readonly auth = inject(AuthService);
  private readonly cookieConsent = inject(CookieConsentService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private static readonly MIN_DWELL_MS = 1_000;
  private static readonly FLUSH_INTERVAL_MS = 5_000;

  private observer: IntersectionObserver | null = null;
  private readonly elementMap = new Map<Element, string>();

  /** Pending timers for the 1-second visibility threshold. */
  private readonly thresholdTimers = new Map<Element, ReturnType<typeof setTimeout>>();

  /** Timestamp when each element became visible (after passing the threshold). */
  private readonly visibleSince = new Map<Element, number>();

  /** Accumulated dwell ms per postId, ready to be flushed. */
  private readonly dwellBuffer = new Map<string, number>();

  /** Post IDs already flushed in this context (avoid re-sending). */
  private readonly flushed = new Set<string>();

  private flushTimer: ReturnType<typeof setInterval> | null = null;

  track(element: Element, postId: string): void {
    if (!this.isBrowser || !this.auth.isSignedIn() || !this.cookieConsent.allowsAnalytics()) return;
    this.ensureObserver();
    this.elementMap.set(element, postId);
    this.observer!.observe(element);
  }

  untrack(element: Element): void {
    this.snapshotDwell(element);
    this.observer?.unobserve(element);
    this.elementMap.delete(element);
    this.cancelThreshold(element);
  }

  reset(): void {
    this.flushed.clear();
    this.dwellBuffer.clear();
    for (const timer of this.thresholdTimers.values()) clearTimeout(timer);
    this.thresholdTimers.clear();
    this.visibleSince.clear();
  }

  flush(): void {
    // Snapshot all currently visible elements before flushing.
    // Collect keys first — mutating a Map during iteration causes infinite loops.
    const visibleEls = [...this.visibleSince.keys()];
    for (const el of visibleEls) {
      this.snapshotDwell(el);
      this.visibleSince.set(el, Date.now()); // restart timer
    }

    if (this.dwellBuffer.size === 0) return;

    const impressions = [...this.dwellBuffer.entries()].map(([post_id, dwell_ms]) => ({
      post_id,
      dwell_ms: Math.round(dwell_ms),
    }));
    this.dwellBuffer.clear();
    impressions.forEach((i) => this.flushed.add(i.post_id));

    this.feed.reportImpressions(impressions).subscribe();
  }

  ngOnDestroy(): void {
    this.flush();
    this.observer?.disconnect();
    if (this.flushTimer) clearInterval(this.flushTimer);
    for (const timer of this.thresholdTimers.values()) clearTimeout(timer);
    this.thresholdTimers.clear();
  }

  private ensureObserver(): void {
    if (this.observer) return;

    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const postId = this.elementMap.get(entry.target);
          if (!postId) continue;

          if (entry.isIntersecting) {
            if (!this.thresholdTimers.has(entry.target) && !this.visibleSince.has(entry.target)) {
              const timer = setTimeout(() => {
                this.thresholdTimers.delete(entry.target);
                this.visibleSince.set(entry.target, Date.now());
              }, ImpressionTrackerService.MIN_DWELL_MS);
              this.thresholdTimers.set(entry.target, timer);
            }
          } else {
            this.cancelThreshold(entry.target);
            this.snapshotDwell(entry.target);
          }
        }
      },
      { threshold: 0.5 },
    );

    this.flushTimer = setInterval(() => this.flush(), ImpressionTrackerService.FLUSH_INTERVAL_MS);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flush();
    });
  }

  private cancelThreshold(element: Element): void {
    const timer = this.thresholdTimers.get(element);
    if (timer) {
      clearTimeout(timer);
      this.thresholdTimers.delete(element);
    }
  }

  /** Move elapsed dwell time from visibleSince into dwellBuffer. */
  private snapshotDwell(element: Element): void {
    const since = this.visibleSince.get(element);
    if (since == null) return;
    const postId = this.elementMap.get(element);
    if (!postId) return;

    const elapsed = Date.now() - since;
    this.visibleSince.delete(element);
    this.dwellBuffer.set(postId, (this.dwellBuffer.get(postId) ?? 0) + elapsed);
  }
}

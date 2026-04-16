import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnDestroy,
  signal,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { NgpButton } from 'ng-primitives/button';
import { AuthService } from './core/auth.service';
import { NotificationService } from './core/notification.service';
import { ThemeToggleComponent } from './shared/theme-toggle/theme-toggle.component';
import { CookieBanner } from './shared/cookie-banner/cookie-banner';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, NgpButton, ThemeToggleComponent, CookieBanner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col min-h-screen' },
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnDestroy {
  protected readonly auth = inject(AuthService);
  protected readonly notificationService = inject(NotificationService);
  protected readonly currentYear = new Date().getFullYear();
  protected readonly headerHidden = signal(false);
  private scrollCleanup: (() => void) | null = null;

  private readonly router = inject(Router);
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  protected readonly isLandingPage = computed(() => this.url() === '/');

  protected readonly activeNav = computed<'foryou' | 'following' | 'explore' | null>(() => {
    const url = this.url();
    if (url.startsWith('/explore')) return 'explore';
    if (url.startsWith('/feed')) {
      return url.includes('tab=following') ? 'following' : 'foryou';
    }
    return null;
  });

  constructor() {
    afterNextRender(() => {
      const splash = document.getElementById('arguon-splash');
      if (splash) {
        splash.classList.add('fade-out');
        splash.addEventListener('transitionend', () => splash.remove(), { once: true });
      }
      this.initScrollListener();
    });

    effect(() => {
      if (this.auth.isSignedIn()) {
        this.notificationService.startPolling();
      } else {
        this.notificationService.stopPolling();
      }
    });
  }

  ngOnDestroy(): void {
    this.scrollCleanup?.();
  }

  private initScrollListener(): void {
    let lastY = window.scrollY;
    const threshold = 10;
    const onScroll = () => {
      const currentY = window.scrollY;
      if (Math.abs(currentY - lastY) < threshold) return;
      this.headerHidden.set(currentY > lastY && currentY > 60);
      lastY = currentY;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    this.scrollCleanup = () => window.removeEventListener('scroll', onScroll);
  }
}

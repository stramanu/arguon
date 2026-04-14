import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  OnDestroy,
  viewChild,
} from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { NgpButton } from 'ng-primitives/button';
import { AuthService } from './core/auth.service';
import { NotificationService } from './core/notification.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, NgpButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="flex items-center justify-between px-6 py-3 border-b border-border">
      <nav class="flex items-center gap-6">
        <a routerLink="/" class="font-bold text-xl">Arguon</a>
        <a routerLink="/explore" class="text-text-secondary hover:text-text">Explore</a>
      </nav>
      <div class="flex items-center gap-4">
        @if (auth.isSignedIn()) {
          <a routerLink="/notifications" class="relative inline-flex items-center text-text-secondary hover:text-text">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            @if (notificationService.unreadCount() > 0) {
              <span class="absolute -top-1.5 -right-2 bg-red-500 text-white text-[0.65rem] font-bold min-w-4 h-4 rounded-full flex items-center justify-center px-1">
                {{ notificationService.unreadCount() }}
              </span>
            }
          </a>
          <div #userBtnEl></div>
        } @else {
          <a routerLink="/sign-in" ngpButton class="text-text-secondary hover:text-text">Sign in</a>
        }
      </div>
    </header>
    <main class="p-4">
      <router-outlet />
    </main>
  `,
})
export class App implements OnDestroy {
  protected readonly auth = inject(AuthService);
  protected readonly notificationService = inject(NotificationService);
  private readonly userBtnEl = viewChild<ElementRef<HTMLDivElement>>('userBtnEl');
  private mountedEl: HTMLDivElement | null = null;

  constructor() {
    effect(() => {
      const el = this.userBtnEl()?.nativeElement ?? null;
      if (el && el !== this.mountedEl) {
        this.auth.mountUserButton(el);
        this.mountedEl = el;
      } else if (!el && this.mountedEl) {
        this.auth.unmountUserButton(this.mountedEl);
        this.mountedEl = null;
      }
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
    if (this.mountedEl) {
      this.auth.unmountUserButton(this.mountedEl);
      this.mountedEl = null;
    }
  }
}

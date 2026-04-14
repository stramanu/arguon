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
import { AuthService } from './core/auth.service';
import { NotificationService } from './core/notification.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="navbar">
      <nav>
        <a routerLink="/" class="logo">Arguon</a>
        <a routerLink="/explore">Explore</a>
      </nav>
      <div class="actions">
        @if (auth.isSignedIn()) {
          <a routerLink="/notifications" class="bell-link">
            <svg class="bell-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            @if (notificationService.unreadCount() > 0) {
              <span class="badge">{{ notificationService.unreadCount() }}</span>
            }
          </a>
          <div #userBtnEl class="user-button"></div>
        } @else {
          <a routerLink="/sign-in">Sign in</a>
        }
      </div>
    </header>
    <main>
      <router-outlet />
    </main>
  `,
  styles: `
    .navbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem 1.5rem;
      border-bottom: 1px solid #e5e7eb;
    }
    nav {
      display: flex;
      align-items: center;
      gap: 1.5rem;
    }
    .logo {
      font-weight: 700;
      font-size: 1.25rem;
      text-decoration: none;
      color: inherit;
    }
    nav a {
      text-decoration: none;
      color: #374151;
    }
    .actions {
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    .actions a {
      text-decoration: none;
      color: #374151;
    }
    .bell-link {
      position: relative;
      display: inline-flex;
      align-items: center;
    }
    .bell-icon {
      display: block;
    }
    .badge {
      position: absolute;
      top: -6px;
      right: -8px;
      background: #ef4444;
      color: #fff;
      font-size: 0.65rem;
      font-weight: 700;
      min-width: 16px;
      height: 16px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 4px;
    }
    main {
      padding: 1rem;
    }
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

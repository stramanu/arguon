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
          <a routerLink="/notifications">Notifications</a>
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
    main {
      padding: 1rem;
    }
  `,
})
export class App implements OnDestroy {
  protected readonly auth = inject(AuthService);
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
  }

  ngOnDestroy(): void {
    if (this.mountedEl) {
      this.auth.unmountUserButton(this.mountedEl);
      this.mountedEl = null;
    }
  }
}

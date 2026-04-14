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
import { ThemeToggleComponent } from './shared/theme-toggle/theme-toggle.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, NgpButton, ThemeToggleComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col min-h-screen' },
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnDestroy {
  protected readonly auth = inject(AuthService);
  protected readonly notificationService = inject(NotificationService);
  protected readonly currentYear = new Date().getFullYear();
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

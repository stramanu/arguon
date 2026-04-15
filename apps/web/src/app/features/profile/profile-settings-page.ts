import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  OnDestroy,
  signal,
  viewChild,
  AfterViewInit,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { NgpAvatar, NgpAvatarImage, NgpAvatarFallback } from 'ng-primitives/avatar';
import { NgpButton } from 'ng-primitives/button';
import { AuthService } from '../../core/auth.service';
import { ThemeService } from '../../core/theme.service';
import { CookieConsentService } from '../../core/cookie-consent.service';
import { ThemeToggleComponent } from '../../shared/theme-toggle/theme-toggle.component';
import { environment } from '../../../environments/environment';

interface MyProfile {
  id: string;
  handle: string;
  name: string;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
  follower_count: number;
  following_count: number;
}

@Component({
  selector: 'app-profile-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NgpAvatar, NgpAvatarImage, NgpAvatarFallback, NgpButton, ThemeToggleComponent],
  templateUrl: './profile-settings-page.html',
  styleUrl: './profile-settings-page.scss',
})
export class ProfileSettingsPage implements AfterViewInit, OnDestroy {
  protected readonly auth = inject(AuthService);
  protected readonly themeService = inject(ThemeService);
  protected readonly cookieConsent = inject(CookieConsentService);
  private readonly http = inject(HttpClient);

  protected readonly profile = signal<MyProfile | null>(null);
  protected readonly loading = signal(true);
  protected readonly showClerkProfile = signal(false);

  private readonly clerkProfileEl = viewChild<ElementRef<HTMLDivElement>>('clerkProfileEl');

  protected readonly joinedDate = computed(() => {
    const p = this.profile();
    if (!p) return '';
    return new Date(p.created_at).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
  });

  constructor() {
    this.loadProfile();
  }

  ngAfterViewInit(): void {
    // Clerk profile is mounted on demand via toggleClerkProfile()
  }

  ngOnDestroy(): void {
    const el = this.clerkProfileEl()?.nativeElement;
    if (el) {
      this.auth.unmountUserProfile(el);
    }
  }

  protected toggleClerkProfile(): void {
    this.showClerkProfile.update((v) => !v);

    if (this.showClerkProfile()) {
      // Wait for the element to be rendered
      setTimeout(() => {
        const el = this.clerkProfileEl()?.nativeElement;
        if (el) {
          this.auth.mountUserProfile(el);
        }
      });
    } else {
      const el = this.clerkProfileEl()?.nativeElement;
      if (el) {
        this.auth.unmountUserProfile(el);
      }
    }
  }

  protected acceptAllCookies(): void {
    this.cookieConsent.accept('all');
  }

  protected acceptEssentialCookies(): void {
    this.cookieConsent.accept('essential');
  }

  private loadProfile(): void {
    this.http
      .get<{ data: MyProfile }>(`${environment.apiUrl}/auth/me`)
      .subscribe({
        next: (res) => {
          const user = res.data;
          // Fetch follow counts via the public profile endpoint
          this.http
            .get<{ data: MyProfile & { follower_count: number; following_count: number } }>(
              `${environment.apiUrl}/users/${encodeURIComponent(user.handle)}`,
            )
            .subscribe({
              next: (profileRes) => {
                this.profile.set({
                  ...user,
                  follower_count: profileRes.data.follower_count,
                  following_count: profileRes.data.following_count,
                });
                this.loading.set(false);
              },
              error: () => {
                this.profile.set({ ...user, follower_count: 0, following_count: 0 });
                this.loading.set(false);
              },
            });
        },
        error: () => {
          this.loading.set(false);
        },
      });
  }
}

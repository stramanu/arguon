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
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NgpAvatar, NgpAvatarImage, NgpAvatarFallback } from 'ng-primitives/avatar';
import { NgpButton } from 'ng-primitives/button';
import { AuthService } from '../../core/auth.service';
import { ThemeService } from '../../core/theme.service';
import { CookieConsentService } from '../../core/cookie-consent.service';
import { ThemeToggleComponent } from '../../shared/theme-toggle/theme-toggle.component';
import { TopicSelectorComponent } from '../../shared/topic-selector/topic-selector';
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
  imports: [RouterLink, FormsModule, NgpAvatar, NgpAvatarImage, NgpAvatarFallback, NgpButton, ThemeToggleComponent, TopicSelectorComponent],
  templateUrl: './profile-settings-page.html',
  styleUrl: './profile-settings-page.scss',
})
export class ProfileSettingsPage implements AfterViewInit, OnDestroy {
  protected readonly auth = inject(AuthService);
  protected readonly themeService = inject(ThemeService);
  protected readonly cookieConsent = inject(CookieConsentService);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);

  protected readonly profile = signal<MyProfile | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly showClerkProfile = signal(false);
  protected readonly topicPreferences = signal<string[]>([]);
  protected readonly topicsSaving = signal(false);
  protected readonly topicsSaved = signal(false);
  private topicDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private handleCheckTimer: ReturnType<typeof setTimeout> | null = null;

  // Profile edit state
  protected readonly editingProfile = signal(false);
  protected readonly editHandle = signal('');
  protected readonly editName = signal('');
  protected readonly handleAvailable = signal<boolean | null>(null);
  protected readonly handleChecking = signal(false);
  protected readonly handleError = signal<string | null>(null);
  protected readonly profileSaving = signal(false);
  protected readonly profileSaved = signal(false);
  protected readonly profileSaveError = signal<string | null>(null);

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
    this.loadTopicPreferences();
  }

  ngAfterViewInit(): void {
    // Clerk profile is mounted on demand via toggleClerkProfile()
  }

  ngOnDestroy(): void {
    const el = this.clerkProfileEl()?.nativeElement;
    if (el) {
      this.auth.unmountUserProfile(el);
    }
    if (this.topicDebounceTimer) {
      clearTimeout(this.topicDebounceTimer);
    }
    if (this.handleCheckTimer) {
      clearTimeout(this.handleCheckTimer);
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

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    this.router.navigateByUrl('/');
  }

  protected startEditProfile(): void {
    const p = this.profile();
    if (!p) return;
    this.editHandle.set(p.handle);
    this.editName.set(p.name);
    this.handleAvailable.set(null);
    this.handleError.set(null);
    this.profileSaveError.set(null);
    this.profileSaved.set(false);
    this.editingProfile.set(true);
  }

  protected cancelEditProfile(): void {
    this.editingProfile.set(false);
    if (this.handleCheckTimer) {
      clearTimeout(this.handleCheckTimer);
      this.handleCheckTimer = null;
    }
  }

  protected onHandleInput(value: string): void {
    const normalized = value.toLowerCase().replace(/[^a-z0-9_]/g, '');
    this.editHandle.set(normalized);
    this.handleAvailable.set(null);
    this.handleError.set(null);

    if (this.handleCheckTimer) {
      clearTimeout(this.handleCheckTimer);
    }

    if (normalized.length < 3) {
      this.handleError.set('Handle must be at least 3 characters');
      return;
    }

    if (!/^[a-z]/.test(normalized)) {
      this.handleError.set('Must start with a letter');
      return;
    }

    if (normalized === this.profile()?.handle) {
      this.handleAvailable.set(true);
      return;
    }

    this.handleChecking.set(true);
    this.handleCheckTimer = setTimeout(() => {
      this.http
        .get<{ available: boolean }>(`${environment.apiUrl}/auth/handle-available?handle=${encodeURIComponent(normalized)}`)
        .subscribe({
          next: (res) => {
            this.handleAvailable.set(res.available);
            if (!res.available) {
              this.handleError.set('This handle is already taken');
            }
            this.handleChecking.set(false);
          },
          error: (err) => {
            const msg = err?.error?.error?.message ?? 'Could not check availability';
            this.handleError.set(msg);
            this.handleChecking.set(false);
          },
        });
    }, 300);
  }

  protected saveProfile(): void {
    const p = this.profile();
    if (!p) return;

    const handle = this.editHandle();
    const name = this.editName().trim();

    if (!name) {
      this.profileSaveError.set('Name is required');
      return;
    }

    const body: Record<string, string> = {};
    if (handle !== p.handle) body['handle'] = handle;
    if (name !== p.name) body['name'] = name;

    if (Object.keys(body).length === 0) {
      this.editingProfile.set(false);
      return;
    }

    this.profileSaving.set(true);
    this.profileSaveError.set(null);

    this.http
      .patch<{ data: { handle: string; name: string } }>(`${environment.apiUrl}/auth/me`, body)
      .subscribe({
        next: (res) => {
          this.profile.update((prev) => prev ? { ...prev, handle: res.data.handle, name: res.data.name } : prev);
          this.profileSaving.set(false);
          this.profileSaved.set(true);
          this.editingProfile.set(false);
        },
        error: (err) => {
          const msg = err?.error?.error?.message ?? 'Could not save profile';
          this.profileSaveError.set(msg);
          this.profileSaving.set(false);
        },
      });
  }

  protected acceptAllCookies(): void {
    this.cookieConsent.accept('all');
  }

  protected acceptEssentialCookies(): void {
    this.cookieConsent.accept('essential');
  }

  protected onTopicsChange(topics: string[]): void {
    this.topicPreferences.set(topics);
    this.topicsSaved.set(false);

    if (this.topicDebounceTimer) {
      clearTimeout(this.topicDebounceTimer);
    }

    this.topicDebounceTimer = setTimeout(() => {
      this.saveTopicPreferences(topics);
    }, 300);
  }

  private loadTopicPreferences(): void {
    this.http
      .get<{ topics: string[] }>(`${environment.apiUrl}/auth/me/preferences`)
      .subscribe({
        next: (res) => this.topicPreferences.set(res.topics),
        error: () => { /* silent — preferences are optional */ },
      });
  }

  private saveTopicPreferences(topics: string[]): void {
    this.topicsSaving.set(true);
    this.http
      .put<{ ok: boolean }>(`${environment.apiUrl}/auth/me/preferences`, { topics })
      .subscribe({
        next: () => {
          this.topicsSaving.set(false);
          this.topicsSaved.set(true);
        },
        error: () => {
          this.topicsSaving.set(false);
        },
      });
  }

  protected loadProfile(): void {
    this.loading.set(true);
    this.loadError.set(null);

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
        error: (err) => {
          const status = err?.status ?? 'unknown';
          this.loadError.set(`Request failed (${status})`);
          this.loading.set(false);
        },
      });
  }
}

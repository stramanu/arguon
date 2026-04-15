import { Injectable, signal, computed, inject, PLATFORM_ID, effect } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { loadClerkJSScript, loadClerkUIScript } from '@clerk/shared/loadClerkJsScript';
import type { Clerk, ClerkOptions, ClerkUIConstructor } from '@clerk/shared/types';
import { environment } from '../../environments/environment';
import { ThemeService } from './theme.service';

const CLERK_DARK_APPEARANCE = { variables: { colorBackground: '#f5faf8', colorNeutral: '#091413', colorPrimary: '#285A48', colorInputBackground: '#ffffff', colorInputText: '#091413', borderRadius: '0.5rem' } };
const CLERK_LIGHT_APPEARANCE = { variables: { colorBackground: '#f5faf8', colorNeutral: '#091413', colorPrimary: '#285A48', colorInputBackground: '#ffffff', colorInputText: '#091413', borderRadius: '0.5rem' } };

interface BrowserClerk extends Clerk {
  load: (opts?: Omit<ClerkOptions, 'isSatellite'> & Record<string, unknown>) => Promise<void>;
  __internal_updateProps: (props: Record<string, unknown>) => void;
}

declare global {
  interface Window {
    Clerk: BrowserClerk;
    __internal_ClerkUICtor: ClerkUIConstructor;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly themeService = inject(ThemeService);
  private clerk: BrowserClerk | null = null;

  private readonly _isLoaded = signal(false);
  private readonly _userId = signal<string | null>(null);
  private readonly _userName = signal<string | null>(null);
  private readonly _userAvatar = signal<string | null>(null);

  readonly isLoaded = this._isLoaded.asReadonly();
  readonly userId = this._userId.asReadonly();
  readonly isSignedIn = computed(() => this._userId() !== null);
  readonly userName = this._userName.asReadonly();
  readonly userAvatar = this._userAvatar.asReadonly();

  constructor() {
    effect(() => {
      this.clerk?.__internal_updateProps({ appearance: this.clerkAppearance() });
    });
  }

  async init(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    const publishableKey = environment.clerkPublishableKey;
    const clerkUICtorPromise: Promise<ClerkUIConstructor> = loadClerkUIScript({ publishableKey })
      .then(() => window.__internal_ClerkUICtor);

    await loadClerkJSScript({ publishableKey });
    await window.Clerk.load({
      ui: { ClerkUI: clerkUICtorPromise },
      appearance: this.clerkAppearance(),
    });
    this.clerk = window.Clerk;

    this._isLoaded.set(true);
    this.syncUser();
    this.clerk.addListener(() => this.syncUser());
  }

  private clerkAppearance() {
    return this.themeService.theme() === 'dark' ? CLERK_DARK_APPEARANCE : CLERK_LIGHT_APPEARANCE;
  }

  private syncUser(): void {
    const user = this.clerk?.user;
    this._userId.set(user?.id ?? null);
    this._userName.set(
      user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.username : null,
    );
    this._userAvatar.set(user?.imageUrl ?? null);

    if (user) {
      this.syncToBackend(
        `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.username || '',
        user.imageUrl ?? '',
      );
    }
  }

  private syncToBackend(name: string, avatarUrl: string): void {
    this.getToken().then((token) => {
      if (!token) return;
      fetch(`${environment.apiUrl}/auth/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, avatar_url: avatarUrl }),
      }).catch(() => { /* best-effort sync */ });
    });
  }

  async getToken(): Promise<string | null> {
    if (!this.clerk?.session) return null;
    return this.clerk.session.getToken();
  }

  async signOut(): Promise<void> {
    await this.clerk?.signOut();
  }

  mountSignIn(element: HTMLDivElement): void {
    this.clerk?.mountSignIn(element);
  }

  unmountSignIn(element: HTMLDivElement): void {
    this.clerk?.unmountSignIn(element);
  }

  mountSignUp(element: HTMLDivElement): void {
    this.clerk?.mountSignUp(element);
  }

  unmountSignUp(element: HTMLDivElement): void {
    this.clerk?.unmountSignUp(element);
  }

  mountUserButton(element: HTMLDivElement): void {
    this.clerk?.mountUserButton(element);
  }

  unmountUserButton(element: HTMLDivElement): void {
    this.clerk?.unmountUserButton(element);
  }

  mountUserProfile(element: HTMLDivElement): void {
    this.clerk?.mountUserProfile(element);
  }

  unmountUserProfile(element: HTMLDivElement): void {
    this.clerk?.unmountUserProfile(element);
  }
}

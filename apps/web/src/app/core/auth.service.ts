import { Injectable, signal, computed, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { Clerk } from '@clerk/clerk-js';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly platformId = inject(PLATFORM_ID);
  private clerk: Clerk | null = null;

  private readonly _isLoaded = signal(false);
  private readonly _userId = signal<string | null>(null);
  private readonly _userName = signal<string | null>(null);
  private readonly _userAvatar = signal<string | null>(null);

  readonly isLoaded = this._isLoaded.asReadonly();
  readonly userId = this._userId.asReadonly();
  readonly isSignedIn = computed(() => this._userId() !== null);
  readonly userName = this._userName.asReadonly();
  readonly userAvatar = this._userAvatar.asReadonly();

  async init(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    const { Clerk: ClerkConstructor } = await import('@clerk/clerk-js');
    this.clerk = new ClerkConstructor(environment.clerkPublishableKey);
    await this.clerk.load();

    this._isLoaded.set(true);
    this.syncUser();

    this.clerk.addListener(() => this.syncUser());
  }

  private syncUser(): void {
    const user = this.clerk?.user;
    this._userId.set(user?.id ?? null);
    this._userName.set(
      user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.username : null,
    );
    this._userAvatar.set(user?.imageUrl ?? null);
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
}

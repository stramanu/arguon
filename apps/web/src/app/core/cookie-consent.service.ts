import { Injectable, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type CookieConsent = 'all' | 'essential' | null;

const STORAGE_KEY = 'arguon-cookie-consent';

@Injectable({ providedIn: 'root' })
export class CookieConsentService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly _consent = signal<CookieConsent>(this.loadConsent());

  readonly consent = this._consent.asReadonly();
  readonly hasConsented = () => this._consent() !== null;
  readonly allowsAnalytics = () => this._consent() === 'all';

  accept(level: 'all' | 'essential'): void {
    this._consent.set(level);
    if (this.isBrowser) {
      localStorage.setItem(STORAGE_KEY, level);
    }
  }

  private loadConsent(): CookieConsent {
    if (!this.isBrowser) return null;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'all' || stored === 'essential') return stored;
    return null;
  }
}

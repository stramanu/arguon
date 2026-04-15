import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgpButton } from 'ng-primitives/button';
import { CookieConsentService } from '../../core/cookie-consent.service';

@Component({
  selector: 'app-cookie-banner',
  imports: [RouterLink, NgpButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cookie-banner.html',
  styleUrl: './cookie-banner.scss',
})
export class CookieBanner {
  protected readonly consent = inject(CookieConsentService);

  protected acceptAll(): void {
    this.consent.accept('all');
  }

  protected acceptEssential(): void {
    this.consent.accept('essential');
  }
}

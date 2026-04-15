import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CookieConsentService } from '../../core/cookie-consent.service';

@Component({
  selector: 'app-cookie-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cookie-page.html',
  styleUrl: './cookie-page.scss',
})
export class CookiePage {
  protected readonly consent = inject(CookieConsentService);
}

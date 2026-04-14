import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-terms-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './terms-page.html',
  styleUrl: './terms-page.scss',
})
export class TermsPage {}

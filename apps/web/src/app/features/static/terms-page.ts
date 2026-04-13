import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-terms-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1>Terms of Service</h1>`,
})
export class TermsPage {}

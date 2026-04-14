import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-terms-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="max-w-[640px] mx-auto p-6"><h1 class="text-2xl font-bold">Terms of Service</h1></div>`,
})
export class TermsPage {}

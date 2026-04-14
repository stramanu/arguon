import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-privacy-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="max-w-[640px] mx-auto p-6"><h1 class="text-2xl font-bold">Privacy Policy</h1></div>`,
})
export class PrivacyPage {}

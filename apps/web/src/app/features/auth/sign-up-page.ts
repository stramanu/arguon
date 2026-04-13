import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-sign-up-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p>Sign Up (Clerk)</p>`,
})
export class SignUpPage {}

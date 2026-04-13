import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-following-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p>Following</p>`,
})
export class FollowingPage {}

import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-followers-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p>Followers</p>`,
})
export class FollowersPage {}

import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-feed-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p>Home Feed — For You</p>`,
})
export class FeedPage {}

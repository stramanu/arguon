import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-post-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p>Post Detail</p>`,
})
export class PostDetailPage {}

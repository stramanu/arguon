import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-explore-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p>Explore — Global Feed</p>`,
})
export class ExplorePage {}

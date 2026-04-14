import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-about-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './about-page.html',
  styleUrl: './about-page.scss',
})
export class AboutPage {}

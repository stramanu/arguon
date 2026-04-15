import { Directive, ElementRef, OnInit, OnDestroy, inject, input } from '@angular/core';
import { ImpressionTrackerService } from '../../core/impression-tracker.service';

@Directive({ selector: '[appTrackImpression]' })
export class TrackImpressionDirective implements OnInit, OnDestroy {
  private readonly el = inject(ElementRef);
  private readonly tracker = inject(ImpressionTrackerService);

  readonly appTrackImpression = input.required<string>();

  ngOnInit(): void {
    this.tracker.track(this.el.nativeElement, this.appTrackImpression());
  }

  ngOnDestroy(): void {
    this.tracker.untrack(this.el.nativeElement);
  }
}

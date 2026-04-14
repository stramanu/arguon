import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  viewChild,
} from '@angular/core';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-sign-up-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex justify-center items-center min-h-[80vh]">
      <div #signUpEl></div>
    </div>
  `,
})
export class SignUpPage implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly signUpEl = viewChild.required<ElementRef<HTMLDivElement>>('signUpEl');

  ngOnInit(): void {
    this.auth.mountSignUp(this.signUpEl().nativeElement);
  }

  ngOnDestroy(): void {
    this.auth.unmountSignUp(this.signUpEl().nativeElement);
  }
}

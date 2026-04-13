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
  selector: 'app-sign-in-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="auth-container">
      <div #signInEl></div>
    </div>
  `,
  styles: `
    .auth-container {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 80vh;
    }
  `,
})
export class SignInPage implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly signInEl = viewChild.required<ElementRef<HTMLDivElement>>('signInEl');

  ngOnInit(): void {
    this.auth.mountSignIn(this.signInEl().nativeElement);
  }

  ngOnDestroy(): void {
    this.auth.unmountSignIn(this.signInEl().nativeElement);
  }
}

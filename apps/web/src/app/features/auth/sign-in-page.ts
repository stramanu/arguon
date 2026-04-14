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
  templateUrl: './sign-in-page.html',
  styleUrl: './sign-in-page.scss',
})
export class SignInPage implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly signInEl = viewChild.required<ElementRef<HTMLDivElement>>('signInEl');

  ngOnInit(): void {
    console.log('Mounting Clerk Sign-In', this.signInEl().nativeElement);
    this.auth.mountSignIn(this.signInEl().nativeElement);
  }

  ngOnDestroy(): void {
    this.auth.unmountSignIn(this.signInEl().nativeElement);
  }
}

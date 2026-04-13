import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap } from 'rxjs';
import { AuthService } from './auth.service';

export const clerkAuthInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  return from(auth.getToken()).pipe(
    switchMap((token) => {
      if (!token) return next(req);
      return next(
        req.clone({
          setHeaders: { Authorization: `Bearer ${token}` },
        }),
      );
    }),
  );
};

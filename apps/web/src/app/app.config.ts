import { APP_INITIALIZER, ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';
import { AuthService } from './core/auth.service';
import { clerkAuthInterceptor } from './core/clerk-auth.interceptor';

function initClerk(auth: AuthService) {
  return () => auth.init();
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([clerkAuthInterceptor])),
    {
      provide: APP_INITIALIZER,
      useFactory: initClerk,
      deps: [AuthService],
      multi: true,
    },
  ],
};

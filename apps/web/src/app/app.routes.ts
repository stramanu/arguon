import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/feed/feed-page').then((m) => m.FeedPage),
  },
  {
    path: 'explore',
    loadComponent: () =>
      import('./features/feed/explore-page').then((m) => m.ExplorePage),
  },
  {
    path: 'p/:id',
    loadComponent: () =>
      import('./features/post/post-detail-page').then(
        (m) => m.PostDetailPage,
      ),
  },
  {
    path: 'u/:handle',
    loadComponent: () =>
      import('./features/profile/profile-page').then((m) => m.ProfilePage),
  },
  {
    path: 'u/:handle/followers',
    loadComponent: () =>
      import('./features/profile/followers-page').then(
        (m) => m.FollowersPage,
      ),
  },
  {
    path: 'u/:handle/following',
    loadComponent: () =>
      import('./features/profile/following-page').then(
        (m) => m.FollowingPage,
      ),
  },
  {
    path: 'sign-in',
    loadComponent: () =>
      import('./features/auth/sign-in-page').then((m) => m.SignInPage),
  },
  {
    path: 'sign-up',
    loadComponent: () =>
      import('./features/auth/sign-up-page').then((m) => m.SignUpPage),
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./features/settings/settings-page').then(
        (m) => m.SettingsPage,
      ),
  },
  {
    path: 'notifications',
    loadComponent: () =>
      import('./features/notifications/notifications-page').then(
        (m) => m.NotificationsPage,
      ),
  },
  {
    path: 'admin',
    loadComponent: () =>
      import('./features/admin/admin-page').then((m) => m.AdminPage),
  },
  {
    path: 'about',
    loadComponent: () =>
      import('./features/static/about-page').then((m) => m.AboutPage),
  },
  {
    path: 'privacy',
    loadComponent: () =>
      import('./features/static/privacy-page').then((m) => m.PrivacyPage),
  },
  {
    path: 'terms',
    loadComponent: () =>
      import('./features/static/terms-page').then((m) => m.TermsPage),
  },
  { path: '**', redirectTo: '' },
];

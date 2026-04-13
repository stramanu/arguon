import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap, catchError, of } from 'rxjs';
import { environment } from '../../../environments/environment';

interface UserProfile {
  id: string;
  handle: string;
  name: string;
  avatar_url: string | null;
  bio: string | null;
  is_ai: boolean;
  is_verified_ai?: boolean;
  created_at: string;
  provider_id?: string | null;
  model_id?: string | null;
  personality?: {
    traits: string[];
    editorial_stance: string;
    preferred_topics: string[];
    agreement_bias: number;
  } | null;
}

@Component({
  selector: 'app-profile-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (error()) {
      <div class="error">{{ error() }}</div>
    } @else if (user()) {
      <div class="profile">
        <div class="profile-header">
          @if (user()!.avatar_url) {
            <img [src]="user()!.avatar_url" [alt]="user()!.name" class="avatar" />
          } @else {
            <div class="avatar avatar-placeholder">{{ user()!.name.charAt(0) }}</div>
          }
          <div class="profile-info">
            <h1>{{ user()!.name }}</h1>
            <span class="handle">&#64;{{ user()!.handle }}</span>
            <div class="badges">
              @if (user()!.is_ai) {
                <span class="badge badge-ai">AI Agent</span>
                @if (user()!.is_verified_ai) {
                  <span class="badge badge-verified">Verified</span>
                }
                @if (user()!.model_id) {
                  <span class="badge badge-model">{{ user()!.model_id }}</span>
                }
                @if (user()!.provider_id) {
                  <span class="badge badge-provider">{{ user()!.provider_id }}</span>
                }
              } @else {
                <span class="badge badge-human">Human</span>
              }
            </div>
          </div>
        </div>

        @if (user()!.bio) {
          <p class="bio">{{ user()!.bio }}</p>
        }

        @if (user()!.is_ai && user()!.personality) {
          <div class="personality-section">
            <h3>Personality</h3>
            <div class="chips">
              @for (trait of user()!.personality!.traits; track trait) {
                <span class="chip">{{ trait }}</span>
              }
            </div>

            <h3>Preferred Topics</h3>
            <div class="chips">
              @for (topic of user()!.personality!.preferred_topics; track topic) {
                <span class="chip chip-topic">{{ topic }}</span>
              }
            </div>

            <p class="stance"><strong>Editorial stance:</strong> {{ user()!.personality!.editorial_stance }}</p>
          </div>
        }

        <div class="profile-actions">
          <button class="btn-follow" disabled>Follow</button>
        </div>

        <div class="profile-meta">
          <span>Joined {{ joinedDate() }}</span>
        </div>
      </div>
    } @else {
      <div class="loading">Loading profile...</div>
    }
  `,
  styles: `
    .profile {
      max-width: 600px;
      margin: 0 auto;
      padding: 1.5rem;
    }
    .profile-header {
      display: flex;
      gap: 1.25rem;
      align-items: flex-start;
    }
    .avatar {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      object-fit: cover;
      flex-shrink: 0;
    }
    .avatar-placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      background: #e5e7eb;
      color: #374151;
      font-size: 2rem;
      font-weight: 600;
    }
    .profile-info h1 {
      margin: 0;
      font-size: 1.5rem;
    }
    .handle {
      color: #6b7280;
      font-size: 0.875rem;
    }
    .badges {
      display: flex;
      gap: 0.5rem;
      margin-top: 0.5rem;
      flex-wrap: wrap;
    }
    .badge {
      font-size: 0.75rem;
      padding: 0.125rem 0.5rem;
      border-radius: 9999px;
      font-weight: 500;
    }
    .badge-ai {
      background: #dbeafe;
      color: #1d4ed8;
    }
    .badge-verified {
      background: #dcfce7;
      color: #15803d;
    }
    .badge-model {
      background: #f3e8ff;
      color: #7c3aed;
    }
    .badge-provider {
      background: #fef3c7;
      color: #92400e;
    }
    .badge-human {
      background: #f3f4f6;
      color: #374151;
    }
    .bio {
      margin-top: 1rem;
      line-height: 1.6;
      color: #374151;
    }
    .personality-section {
      margin-top: 1.5rem;
    }
    .personality-section h3 {
      font-size: 0.875rem;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin: 1rem 0 0.5rem;
    }
    .chips {
      display: flex;
      gap: 0.375rem;
      flex-wrap: wrap;
    }
    .chip {
      font-size: 0.8125rem;
      padding: 0.25rem 0.625rem;
      border-radius: 9999px;
      background: #eff6ff;
      color: #1e40af;
    }
    .chip-topic {
      background: #f0fdf4;
      color: #166534;
    }
    .stance {
      margin-top: 0.75rem;
      font-size: 0.875rem;
      color: #4b5563;
    }
    .profile-actions {
      margin-top: 1.5rem;
    }
    .btn-follow {
      padding: 0.5rem 1.5rem;
      border: 1px solid #d1d5db;
      border-radius: 9999px;
      background: white;
      font-weight: 500;
      cursor: not-allowed;
      color: #9ca3af;
    }
    .profile-meta {
      margin-top: 1rem;
      font-size: 0.8125rem;
      color: #9ca3af;
    }
    .error {
      text-align: center;
      padding: 2rem;
      color: #dc2626;
    }
    .loading {
      text-align: center;
      padding: 2rem;
      color: #6b7280;
    }
  `,
})
export class ProfilePage {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);

  private readonly profile$ = this.route.paramMap.pipe(
    switchMap((params) => {
      const handle = params.get('handle');
      if (!handle) return of(null);
      return this.http
        .get<{ data: UserProfile }>(`${environment.apiUrl}/users/${encodeURIComponent(handle)}`)
        .pipe(catchError(() => of(null)));
    }),
  );

  private readonly result = toSignal(this.profile$, { initialValue: undefined });

  readonly user = computed(() => {
    const r = this.result();
    return r?.data ?? null;
  });

  readonly error = computed(() => {
    const r = this.result();
    if (r === undefined) return null; // loading
    if (r === null) return 'User not found';
    return null;
  });

  readonly joinedDate = computed(() => {
    const u = this.user();
    if (!u) return '';
    return new Date(u.created_at).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
    });
  });
}

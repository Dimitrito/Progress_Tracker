import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, firstValueFrom, map, Observable, of, switchMap, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AuthUser,
  JwtTokens,
  RegisterPayload,
} from '../../features/auth/auth.models';

const ACCESS_TOKEN_KEY = 'auth_access_token';
const REFRESH_TOKEN_KEY = 'auth_refresh_token';

export interface UpdateProfilePayload {
  first_name: string;
  last_name: string;
  avatar?: File | null;
  remove_avatar?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;
  private readonly currentUserSignal = signal<AuthUser | null>(null);

  readonly user = this.currentUserSignal.asReadonly();

  updateProfile(payload: UpdateProfilePayload): Observable<AuthUser> {
    const formData = new FormData();

    formData.append('first_name', payload.first_name);
    formData.append('last_name', payload.last_name);

    if (payload.avatar) {
      formData.append('avatar', payload.avatar);
    }

    if (payload.remove_avatar) {
      formData.append('remove_avatar', 'true');
    }

    return this.http
      .patch<AuthUser>(`${this.baseUrl}/auth/profile/`, formData)
      .pipe(tap((user) => this.currentUserSignal.set(user)));
  }

  login(email: string, password: string): Observable<AuthUser> {
    return this.http
      .post<JwtTokens>(`${this.baseUrl}/auth/login/`, { email, password })
      .pipe(
        tap((tokens) => this.storeSession(tokens)),
        switchMap(() => this.getCurrentUser()),
        tap((user) => this.currentUserSignal.set(user)),
      );
  }

  register(payload: RegisterPayload): Observable<AuthUser> {
    return this.http.post<AuthUser>(`${this.baseUrl}/auth/register/`, payload);
  }

  getCurrentUser(): Observable<AuthUser> {
    return this.http.get<AuthUser>(`${this.baseUrl}/auth/me/`);
  }

  getToken(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  }

  isAuthenticated(): boolean {
    return Boolean(this.getToken());
  }

  logout(): void {
    this.clearSession();
  }

  initialize(): Promise<void> {
    if (!this.getToken()) {
      return Promise.resolve();
    }

    return firstValueFrom(
      this.getCurrentUser().pipe(
        tap((user) => this.currentUserSignal.set(user)),
        map(() => void 0),
        catchError(() => {
          this.clearSession();
          return of(void 0);
        }),
      ),
    );
  }

  private storeSession(tokens: JwtTokens): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access);

    if (tokens.refresh) {
      localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh);
    }
  }

  private clearSession(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    this.currentUserSignal.set(null);
  }
}

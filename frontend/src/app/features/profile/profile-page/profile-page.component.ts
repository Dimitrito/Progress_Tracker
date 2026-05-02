import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { environment } from '../../../../environments/environment';

import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './profile-page.component.html',
  styleUrl: './profile-page.component.css',
})
export class ProfilePageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly authService = inject(AuthService);

  protected readonly isSaving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly successMessage = signal<string | null>(null);

  protected readonly selectedAvatarFile = signal<File | null>(null);
  protected readonly selectedAvatarPreview = signal<string | null>(null);
  protected readonly shouldRemoveAvatar = signal(false);
  protected readonly isAvatarSaving = signal(false);
  protected readonly form = this.fb.nonNullable.group({
    first_name: [''],
    last_name: [''],
  });

  constructor() {
    const user = this.authService.user();

    if (user) {
      this.form.patchValue({
        first_name: user.first_name ?? '',
        last_name: user.last_name ?? '',
      });
    }
  }

  protected get avatarUrl(): string | null {
    if (this.shouldRemoveAvatar()) {
      return null;
    }

    return (
      this.selectedAvatarPreview() ||
      this.resolveMediaUrl(this.authService.user()?.avatar)
    );
  }

  protected get hasAnyAvatar(): boolean {
    return Boolean(this.selectedAvatarPreview() || this.authService.user()?.avatar);
  }

  protected get initials(): string {
    const user = this.authService.user();
    const source =
      `${user?.first_name ?? ''} ${user?.last_name ?? ''}`.trim() ||
      user?.email ||
      'U';

    return source
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }

  private resolveMediaUrl(url: string | null | undefined): string | null {
    if (!url) {
      return null;
    }

    if (
      url.startsWith('http://') ||
      url.startsWith('https://') ||
      url.startsWith('blob:') ||
      url.startsWith('data:')
    ) {
      return url;
    }

    const apiHost = environment.apiUrl.replace(/\/api\/?$/, '');

    return `${apiHost}${url}`;
  }

  onAvatarSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    if (!file) {
      return;
    }

    this.selectedAvatarFile.set(file);
    this.selectedAvatarPreview.set(URL.createObjectURL(file));
    this.shouldRemoveAvatar.set(false);

    const { first_name, last_name } = this.form.getRawValue();

    this.isAvatarSaving.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    this.authService
      .updateProfile({
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        avatar: file,
        remove_avatar: false,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isAvatarSaving.set(false);
          this.successMessage.set('Avatar updated successfully.');
          this.selectedAvatarFile.set(null);
          this.selectedAvatarPreview.set(null);
          input.value = '';
        },
        error: (error: HttpErrorResponse) => {
          this.isAvatarSaving.set(false);
          this.selectedAvatarFile.set(null);
          this.selectedAvatarPreview.set(null);
          input.value = '';
          this.errorMessage.set(this.getErrorMessage(error));
        },
      });
  }

  clearSelectedAvatar(fileInput: HTMLInputElement): void {
    this.selectedAvatarFile.set(null);
    this.selectedAvatarPreview.set(null);
    this.shouldRemoveAvatar.set(true);
    fileInput.value = '';

    const { first_name, last_name } = this.form.getRawValue();

    this.isAvatarSaving.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    this.authService
      .updateProfile({
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        avatar: null,
        remove_avatar: true,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isAvatarSaving.set(false);
          this.shouldRemoveAvatar.set(false);
          this.successMessage.set('Avatar removed successfully.');
        },
        error: (error: HttpErrorResponse) => {
          this.isAvatarSaving.set(false);
          this.shouldRemoveAvatar.set(false);
          this.errorMessage.set(this.getErrorMessage(error));
        },
      });
  }

  submit(): void {
    this.isSaving.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    const { first_name, last_name } = this.form.getRawValue();

    this.authService
      .updateProfile({
        first_name: first_name.trim(),
        last_name: last_name.trim(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isSaving.set(false);
          this.successMessage.set('Profile updated successfully.');
          this.selectedAvatarFile.set(null);
          this.selectedAvatarPreview.set(null);
          this.shouldRemoveAvatar.set(false);

          this.authService.getCurrentUser()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe();
        },
        error: (error: HttpErrorResponse) => {
          this.isSaving.set(false);
          this.errorMessage.set(this.getErrorMessage(error));
        },
      });
  }

  private getErrorMessage(error: HttpErrorResponse): string {
    if (typeof error.error?.detail === 'string') {
      return error.error.detail;
    }

    if (typeof error.error?.avatar?.[0] === 'string') {
      return error.error.avatar[0];
    }

    return 'Unable to update profile right now.';
  }
}

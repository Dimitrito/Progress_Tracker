import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';

import { OrganizationContextService } from '../../../core/services/organization-context.service';
import {
  OrganizationInvitation,
  OrganizationsService,
} from '../../../core/services/organizations.service';

@Component({
  selector: 'app-my-invitations-page',
  standalone: true,
  templateUrl: './my-invitations-page.component.html',
  styleUrl: './my-invitations-page.component.css',
})
export class MyInvitationsPageComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly organizationsService = inject(OrganizationsService);
  private readonly organizationContext = inject(OrganizationContextService);
  private readonly router = inject(Router);

  protected readonly isLoading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly invitations = signal<OrganizationInvitation[]>([]);
  protected readonly processingId = signal<number | null>(null);

  constructor() {
    this.loadInvitations();
  }

  protected formatDate(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return '—';
    }
    return date.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }

  protected accept(invitation: OrganizationInvitation): void {
    this.processingId.set(invitation.id);
    this.organizationsService
      .acceptInvitation(invitation.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.processingId.set(null);
          this.organizationContext.setSelectedOrganization({
            id: invitation.organization,
            name: invitation.organization_name,
            description: '',
            icon: null,
            role: 'member',
          });
          this.loadInvitations();
          void this.router.navigate([
            '/app/organizations',
            invitation.organization,
          ]);
        },
        error: (error: HttpErrorResponse) => {
          this.processingId.set(null);
          this.errorMessage.set(this.parseError(error, 'Could not accept invitation.'));
        },
      });
  }

  protected decline(invitation: OrganizationInvitation): void {
    this.processingId.set(invitation.id);
    this.organizationsService
      .declineInvitation(invitation.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.processingId.set(null);
          this.loadInvitations();
        },
        error: (error: HttpErrorResponse) => {
          this.processingId.set(null);
          this.errorMessage.set(this.parseError(error, 'Could not decline invitation.'));
        },
      });
  }

  protected reload(): void {
    this.loadInvitations();
  }

  private loadInvitations(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.organizationsService
      .getMyInvitations()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (invitations) => {
          this.invitations.set(invitations);
          this.isLoading.set(false);
        },
        error: () => {
          this.invitations.set([]);
          this.errorMessage.set('Unable to load invitations.');
          this.isLoading.set(false);
        },
      });
  }

  private parseError(error: HttpErrorResponse, fallback: string): string {
    if (typeof error.error?.detail === 'string') {
      return error.error.detail;
    }
    return fallback;
  }
}

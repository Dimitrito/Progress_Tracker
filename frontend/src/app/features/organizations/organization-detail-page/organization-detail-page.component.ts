import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';

import { OrganizationContextService } from '../../../core/services/organization-context.service';
import {
  OrganizationApiRole,
  OrganizationInvitation,
  OrganizationJoinRequest,
  OrganizationListItem,
  OrganizationMember,
  OrganizationsService,
} from '../../../core/services/organizations.service';

interface OrganizationDetailViewModel {
  id: number;
  name: string;
  description: string;
  icon: string | null;
  role: OrganizationApiRole;
  roleLabel: string;
  createdAt: string;
}

@Component({
  selector: 'app-organization-detail-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, ConfirmDialogComponent],
  templateUrl: './organization-detail-page.component.html',
  styleUrl: './organization-detail-page.component.css',
})
export class OrganizationDetailPageComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly organizationsService = inject(OrganizationsService);
  private readonly organizationContext = inject(OrganizationContextService);

  private baseline = {
    name: '',
    description: '',
    icon: null as string | null,
  };
  private loadedOrganizationId: number | null = null;

  protected readonly confirmDialogOpen = signal(false);
  protected readonly confirmDialogTitle = signal('');
  protected readonly confirmDialogMessage = signal('');
  protected readonly confirmDialogConfirmText = signal('');
  protected readonly confirmDialogBusy = signal(false);
  protected readonly memberPendingRemoval = signal<OrganizationMember | null>(null);

  protected readonly isLoading = signal(true);
  protected readonly isSaving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly saveError = signal<string | null>(null);
  protected readonly saveSuccess = signal<string | null>(null);
  protected readonly organization = signal<OrganizationDetailViewModel | null>(null);
  protected readonly selectedOrganization =
    this.organizationContext.selectedOrganization;
  protected readonly canEditOrganization = computed(
    () => this.organization()?.role === 'admin',
  );
  protected readonly formDirty = signal(false);

  protected readonly selectedIconFile = signal<File | null>(null);
  protected readonly iconPreviewUrl = signal<string | null>(null);
  protected readonly removeIcon = signal(false);

  protected readonly teamLoading = signal(false);
  protected readonly teamError = signal<string | null>(null);
  protected readonly members = signal<OrganizationMember[]>([]);
  protected readonly pendingInvitations = signal<OrganizationInvitation[]>([]);
  protected readonly joinRequestsForOrg = signal<OrganizationJoinRequest[]>([]);

  protected readonly inviteForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });
  protected readonly inviteSubmitting = signal(false);
  protected readonly inviteError = signal<string | null>(null);
  protected readonly inviteSuccess = signal<string | null>(null);
  protected readonly cancelingInvitationId = signal<number | null>(null);

  protected readonly joinRequestBusyId = signal<number | null>(null);

  protected readonly editOrganizationForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    description: [''],
  });

  constructor() {
    this.editOrganizationForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.syncDirtyFlag());

    this.inviteForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.inviteError.set(null);
        this.inviteSuccess.set(null);
      });

    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const organizationId = Number(params.get('id'));

        if (!Number.isInteger(organizationId) || organizationId <= 0) {
          void this.router.navigateByUrl('/app/organizations');
          return;
        }

        this.loadOrganization(organizationId);
      });
  }

  protected hasDescription(organization: OrganizationDetailViewModel): boolean {
    return organization.description.trim().length > 0;
  }

  protected heroInitials(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) {
      return '?';
    }
    return trimmed[0].toUpperCase();
  }

  protected formatCreatedAt(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return '—';
    }
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  protected formatDateTime(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return '—';
    }
    return date.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }

  protected memberRoleLabel(role: OrganizationApiRole): string {
    switch (role) {
      case 'admin':
        return 'Owner';
      case 'pm':
        return 'Project manager';
      default:
        return 'Member';
    }
  }

  protected onIconSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    if (!file) {
      return;
    }

    this.selectedIconFile.set(file);
    this.removeIcon.set(false);

    const reader = new FileReader();
    reader.onload = () => {
      this.iconPreviewUrl.set(
        typeof reader.result === 'string' ? reader.result : null,
      );
      this.syncDirtyFlag();
    };
    reader.readAsDataURL(file);
  }

  protected removeSelectedIcon(): void {
    this.selectedIconFile.set(null);
    this.iconPreviewUrl.set(null);
    this.removeIcon.set(true);
    this.syncDirtyFlag();
  }

  private deleteOrganization(id: number): void {
    if (!confirm('Are you sure you want to delete this organization?')) {
      return;
    }

    this.organizationsService
      .deleteOrganization(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.organizationContext.clearSelectedOrganization();
          this.router.navigateByUrl('/app/organizations');
        },
        error: () => {
          this.saveError.set('Failed to delete organization.');
        },
      });
  }

  protected handleDangerAction(): void {
    const organization = this.organization();
    if (!organization) return;

    if (organization.role === 'admin') {
      this.deleteOrganization(organization.id);
    } else {
      this.leaveOrganization(organization.id);
    }
  }

  private leaveOrganization(id: number): void {
    if (!confirm('Leave this organization?')) {
      return;
    }

    this.organizationsService
      .leaveOrganization(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.organizationContext.clearSelectedOrganization();
          this.router.navigateByUrl('/app/organizations');
        },
        error: () => {
          this.saveError.set('Failed to leave organization.');
        },
      });
  }

  protected discardChanges(): void {
    this.saveError.set(null);
    this.saveSuccess.set(null);
    this.selectedIconFile.set(null);
    this.iconPreviewUrl.set(this.baseline.icon);
    this.removeIcon.set(false);

    this.editOrganizationForm.reset(
      {
        name: this.baseline.name,
        description: this.baseline.description,
      },
      { emitEvent: false },
    );
    this.editOrganizationForm.markAsPristine();
    this.syncDirtyFlag();
  }

  saveOrganization(): void {
    const organization = this.organization();

    if (!organization) {
      return;
    }

    if (this.editOrganizationForm.invalid) {
      this.editOrganizationForm.markAllAsTouched();
      return;
    }

    const { name, description } = this.editOrganizationForm.getRawValue();

    this.isSaving.set(true);
    this.saveError.set(null);
    this.saveSuccess.set(null);

    this.organizationsService
      .updateOrganization(organization.id, {
        name: name.trim(),
        description: description.trim(),
        icon: this.selectedIconFile(),
        clear_icon: this.removeIcon(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updatedOrganization) => {
          const detailViewModel = this.mapToViewModel(updatedOrganization);
          this.organization.set(detailViewModel);
          this.setBaselineFromApi(updatedOrganization);
          this.selectedIconFile.set(null);
          this.iconPreviewUrl.set(updatedOrganization.icon);
          this.removeIcon.set(false);
          this.editOrganizationForm.reset(
            {
              name: updatedOrganization.name,
              description: updatedOrganization.description,
            },
            { emitEvent: false },
          );
          this.editOrganizationForm.markAsPristine();
          this.syncDirtyFlag();
          this.isSaving.set(false);
          this.saveSuccess.set('Changes saved.');
        },
        error: (error: HttpErrorResponse) => {
          this.isSaving.set(false);
          this.saveError.set(this.getSaveErrorMessage(error));
        },
      });
  }

  protected submitInvite(): void {
    const organization = this.organization();
    if (!organization || !this.canEditOrganization()) {
      return;
    }

    if (this.inviteForm.invalid) {
      this.inviteForm.markAllAsTouched();
      return;
    }

    const email = this.inviteForm.controls.email.getRawValue().trim();
    this.inviteSubmitting.set(true);
    this.inviteError.set(null);
    this.inviteSuccess.set(null);

    this.organizationsService
      .inviteUserByEmail(organization.id, email)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (invitation) => {
          this.inviteSubmitting.set(false);
          this.inviteForm.reset({ email: '' }, { emitEvent: false });
          this.inviteSuccess.set(
            `Invitation sent to ${invitation.invited_user_email}.`,
          );
          this.pendingInvitations.update((list) => [...list, invitation]);
        },
        error: (error: HttpErrorResponse) => {
          this.inviteSubmitting.set(false);
          this.inviteError.set(this.parseInviteError(error));
        },
      });
  }

  protected cancelInvitation(invitation: OrganizationInvitation): void {
    this.cancelingInvitationId.set(invitation.id);
    this.inviteError.set(null);
    this.inviteSuccess.set(null);

    this.organizationsService
      .cancelInvitation(invitation.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.pendingInvitations.update((list) =>
            list.filter((item) => item.id !== invitation.id),
          );
          this.cancelingInvitationId.set(null);
        },
        error: (error: HttpErrorResponse) => {
          this.cancelingInvitationId.set(null);
          this.inviteError.set(this.parseDetail(error, 'Could not cancel invitation.'));
        },
      });
  }

  protected approveJoinRequest(request: OrganizationJoinRequest): void {
    const organizationId = this.loadedOrganizationId;
    this.joinRequestBusyId.set(request.id);

    this.organizationsService
      .approveJoinRequest(request.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.joinRequestBusyId.set(null);
          this.joinRequestsForOrg.update((list) =>
            list.filter((item) => item.id !== request.id),
          );
          if (organizationId !== null) {
            this.refreshMembers(organizationId);
          }
        },
        error: (error: HttpErrorResponse) => {
          this.joinRequestBusyId.set(null);
          this.teamError.set(this.parseDetail(error, 'Could not approve request.'));
        },
      });
  }

  protected rejectJoinRequest(request: OrganizationJoinRequest): void {
    this.joinRequestBusyId.set(request.id);

    this.organizationsService
      .rejectJoinRequest(request.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.joinRequestBusyId.set(null);
          this.joinRequestsForOrg.update((list) =>
            list.filter((item) => item.id !== request.id),
          );
        },
        error: (error: HttpErrorResponse) => {
          this.joinRequestBusyId.set(null);
          this.teamError.set(this.parseDetail(error, 'Could not reject request.'));
        },
      });
  }

  protected canRemoveMember(member: OrganizationMember): boolean {
    const organization = this.organization();

    if (!organization || organization.role !== 'admin') {
      return false;
    }

    if (member.role === 'admin') {
      return false;
    }

    return true;
  }

  protected openRemoveMemberDialog(member: OrganizationMember): void {
    this.memberPendingRemoval.set(member);
    this.confirmDialogTitle.set('Remove member');
    this.confirmDialogMessage.set(
      `Remove ${member.user_email} from this organization? They will lose access immediately.`,
    );
    this.confirmDialogConfirmText.set('Remove');
    this.confirmDialogOpen.set(true);
  }

  protected closeConfirmDialog(): void {
    if (this.confirmDialogBusy()) {
      return;
    }

    this.confirmDialogOpen.set(false);
    this.memberPendingRemoval.set(null);
  }

  protected confirmMemberRemoval(): void {
    const organization = this.organization();
    const member = this.memberPendingRemoval();

    if (!organization || !member) {
      return;
    }

    this.confirmDialogBusy.set(true);

    this.organizationsService
      .removeOrganizationMember(organization.id, member.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.members.update((list) => list.filter((item) => item.id !== member.id));
          this.confirmDialogBusy.set(false);
          this.confirmDialogOpen.set(false);
          this.memberPendingRemoval.set(null);
        },
        error: (error: HttpErrorResponse) => {
          this.confirmDialogBusy.set(false);
          this.teamError.set(this.parseDetail(error, 'Could not remove member.'));
        },
      });
  }

  protected reloadTeamSection(): void {
    const organization = this.organization();
    if (organization) {
      this.loadTeamData(organization.id, organization.role === 'admin');
    }
  }

  private refreshMembers(organizationId: number): void {
    this.organizationsService
      .getOrganizationMembers(organizationId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => this.members.set(list),
        error: () => {
          /* keep existing list */
        },
      });
  }

  private loadOrganization(organizationId: number): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.isSaving.set(false);
    this.saveError.set(null);
    this.saveSuccess.set(null);
    this.loadedOrganizationId = organizationId;
    this.teamError.set(null);
    this.inviteError.set(null);
    this.inviteSuccess.set(null);

    this.organizationsService
      .getOrganizationById(organizationId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (organization) => {
          if (!organization) {
            this.organization.set(null);
            this.errorMessage.set(
              'Organization not found or no longer available in your workspace.',
            );
            this.isLoading.set(false);
            return;
          }

          const detailViewModel = this.mapToViewModel(organization);
          this.organization.set(detailViewModel);
          this.setBaselineFromApi(organization);
          this.selectedIconFile.set(null);
          this.iconPreviewUrl.set(organization.icon);
          this.removeIcon.set(false);
          this.editOrganizationForm.reset(
            {
              name: organization.name,
              description: organization.description,
            },
            { emitEvent: false },
          );
          this.editOrganizationForm.markAsPristine();
          this.syncDirtyFlag();
          this.isLoading.set(false);
          this.loadTeamData(organization.id, organization.role === 'admin');
        },
        error: () => {
          this.organization.set(null);
          this.errorMessage.set('Unable to load this organization right now.');
          this.isLoading.set(false);
        },
      });
  }

  private loadTeamData(organizationId: number, isAdmin: boolean): void {
    this.teamLoading.set(true);
    this.teamError.set(null);

    if (isAdmin) {
      forkJoin({
        members: this.organizationsService.getOrganizationMembers(organizationId),
        invitations:
          this.organizationsService.getPendingInvitationsForOrganization(
            organizationId,
          ),
        joinRequests: this.organizationsService.getReceivedJoinRequests(),
      })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: ({ members, invitations, joinRequests }) => {
            this.members.set(members);
            this.pendingInvitations.set(invitations);
            this.joinRequestsForOrg.set(
              joinRequests.filter(
                (request) =>
                  request.organization === organizationId &&
                  request.status === 'pending',
              ),
            );
            this.teamLoading.set(false);
          },
          error: () => {
            this.teamError.set('Could not load team or access data.');
            this.teamLoading.set(false);
          },
        });
    } else {
      this.organizationsService
        .getOrganizationMembers(organizationId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (memberList) => {
            this.members.set(memberList);
            this.pendingInvitations.set([]);
            this.joinRequestsForOrg.set([]);
            this.teamLoading.set(false);
          },
          error: () => {
            this.teamError.set('Could not load members.');
            this.teamLoading.set(false);
          },
        });
    }
  }

  private setBaselineFromApi(organization: OrganizationListItem): void {
    this.baseline = {
      name: organization.name,
      description: organization.description,
      icon: organization.icon,
    };
  }

  private syncDirtyFlag(): void {
    if (!this.canEditOrganization()) {
      this.formDirty.set(false);
      return;
    }

    const { name, description } = this.editOrganizationForm.getRawValue();

    const dirty =
      name.trim() !== this.baseline.name.trim() ||
      description !== this.baseline.description ||
      this.selectedIconFile() !== null ||
      this.removeIcon();

    this.formDirty.set(dirty);

    if (dirty) {
      this.saveSuccess.set(null);
    }
  }

  private mapToViewModel(
    organization: OrganizationListItem,
  ): OrganizationDetailViewModel {
    return {
      id: organization.id,
      name: organization.name,
      description: organization.description,
      icon: organization.icon,
      role: organization.role,
      roleLabel: this.mapRoleLabel(organization.role),
      createdAt: organization.created_at,
    };
  }

  private mapRoleLabel(role: OrganizationApiRole): string {
    switch (role) {
      case 'admin':
        return 'Owner';
      case 'pm':
        return 'Project manager';
      default:
        return 'Member';
    }
  }

  private getSaveErrorMessage(error: HttpErrorResponse): string {
    return this.parseDetail(error, 'Unable to save organization changes right now.');
  }

  private parseDetail(error: HttpErrorResponse, fallback: string): string {
    if (typeof error.error?.detail === 'string') {
      return error.error.detail;
    }
    if (typeof error.error?.name?.[0] === 'string') {
      return error.error.name[0];
    }
    if (typeof error.error?.description?.[0] === 'string') {
      return error.error.description[0];
    }
    if (typeof error.error?.non_field_errors?.[0] === 'string') {
      return error.error.non_field_errors[0];
    }
    return fallback;
  }

  private parseInviteError(error: HttpErrorResponse): string {
    if (typeof error.error?.detail === 'string') {
      return error.error.detail;
    }
    if (typeof error.error?.invited_user_email?.[0] === 'string') {
      return error.error.invited_user_email[0];
    }
    return 'Could not send invitation.';
  }
}

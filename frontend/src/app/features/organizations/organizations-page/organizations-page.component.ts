import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { OrganizationContextService } from '../../../core/services/organization-context.service';
import {
  OrganizationApiRole,
  OrganizationListItem,
  OrganizationsService,
} from '../../../core/services/organizations.service';

type OrganizationDisplayRole = 'owner' | 'pm' | 'worker';

interface OrganizationCardViewModel {
  id: number;
  name: string;
  description: string;
  icon: string | null;
  apiRole: OrganizationApiRole;
  role: OrganizationDisplayRole;
  roleLabel: string;
  initials: string;
}

@Component({
  selector: 'app-organizations-page',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './organizations-page.component.html',
  styleUrl: './organizations-page.component.css',
})
export class OrganizationsPageComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly organizationsService = inject(OrganizationsService);
  private readonly organizationContext = inject(OrganizationContextService);

  protected readonly isLoading = signal(true);
  protected readonly isCreating = signal(false);
  protected readonly showCreateForm = signal(false);
  protected readonly createError = signal<string | null>(null);
  protected readonly organizations = signal<OrganizationCardViewModel[]>([]);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly selectedOrganization =
    this.organizationContext.selectedOrganization;

  protected readonly selectedIconFile = signal<File | null>(null);
  protected readonly selectedIconPreview = signal<string | null>(null);

  protected readonly createOrganizationForm = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
    description: [''],
  });

  constructor() {
    this.loadOrganizations();
  }

  openCreateForm(): void {
    this.showCreateForm.set(true);
    this.createError.set(null);
  }

  cancelCreateForm(): void {
    this.showCreateForm.set(false);
    this.createError.set(null);
    this.isCreating.set(false);
    this.selectedIconFile.set(null);
    this.selectedIconPreview.set(null);

    this.createOrganizationForm.reset({
      name: '',
      description: '',
    });
  }

  reloadOrganizations(): void {
    this.loadOrganizations();
  }

  onIconSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    this.selectedIconFile.set(file);

    if (!file) {
      this.selectedIconPreview.set(null);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    this.selectedIconPreview.set(objectUrl);
  }

  clearSelectedIcon(fileInput: HTMLInputElement): void {
    this.selectedIconFile.set(null);
    this.selectedIconPreview.set(null);
    fileInput.value = '';
  }

  selectOrganization(organization: OrganizationCardViewModel): void {
    this.organizationContext.setSelectedOrganization({
      id: organization.id,
      name: organization.name,
      description: organization.description,
      icon: organization.icon,
      role: organization.apiRole,
    });
  }

  openOrganizationEditor(organization: OrganizationCardViewModel): void {
    void this.router.navigate(['/app/organizations', organization.id]);
  }

  isActiveOrganization(organizationId: number): boolean {
    return this.selectedOrganization()?.id === organizationId;
  }

  submitCreateForm(): void {
    if (this.createOrganizationForm.invalid) {
      this.createOrganizationForm.markAllAsTouched();
      return;
    }

    const { name, description } = this.createOrganizationForm.getRawValue();

    this.isCreating.set(true);
    this.createError.set(null);

    this.organizationsService
      .createOrganization({
        name: name.trim(),
        description: description.trim(),
        icon: this.selectedIconFile() ?? undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isCreating.set(false);
          this.showCreateForm.set(false);
          this.selectedIconFile.set(null);
          this.selectedIconPreview.set(null);

          this.createOrganizationForm.reset({
            name: '',
            description: '',
          });

          this.loadOrganizations();
        },
        error: (error: HttpErrorResponse) => {
          this.isCreating.set(false);
          this.createError.set(this.getCreateErrorMessage(error));
        },
      });
  }

  private loadOrganizations(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.organizationsService
      .getMyOrganizations()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (organizations) => {
          this.syncSelectedOrganization(organizations);
          this.organizations.set(
            organizations.map((organization) =>
              this.mapToCardViewModel(organization),
            ),
          );
          this.isLoading.set(false);
        },
        error: () => {
          this.organizations.set([]);
          this.errorMessage.set('Unable to load organizations right now.');
          this.isLoading.set(false);
        },
      });
  }

  private syncSelectedOrganization(organizations: OrganizationListItem[]): void {
    const activeOrganizationId = this.selectedOrganization()?.id;

    if (!activeOrganizationId) {
      return;
    }

    const matchingOrganization = organizations.find(
      (organization) => organization.id === activeOrganizationId,
    );

    if (!matchingOrganization) {
      this.organizationContext.clearSelectedOrganization();
      return;
    }

    this.organizationContext.setSelectedOrganization({
      id: matchingOrganization.id,
      name: matchingOrganization.name,
      description: matchingOrganization.description,
      icon: matchingOrganization.icon,
      role: matchingOrganization.role,
    });
  }

  private mapToCardViewModel(
    organization: OrganizationListItem,
  ): OrganizationCardViewModel {
    return {
      id: organization.id,
      name: organization.name,
      description:
        organization.description.trim() || 'No description provided yet.',
      icon: organization.icon,
      apiRole: organization.role,
      role: this.mapRole(organization.role),
      roleLabel: this.mapRoleLabel(organization.role),
      initials: this.buildInitials(organization.name),
    };
  }

  private mapRole(role: OrganizationApiRole): OrganizationDisplayRole {
    switch (role) {
      case 'admin':
        return 'owner';
      case 'pm':
        return 'pm';
      default:
        return 'worker';
    }
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

  private buildInitials(name: string): string {
    const words = name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2);

    if (words.length === 0) {
      return 'OR';
    }

    return words.map((word) => word[0]?.toUpperCase() ?? '').join('');
  }

  private getCreateErrorMessage(error: HttpErrorResponse): string {
    if (typeof error.error?.detail === 'string') {
      return error.error.detail;
    }

    if (typeof error.error?.name?.[0] === 'string') {
      return error.error.name[0];
    }

    if (typeof error.error?.description?.[0] === 'string') {
      return error.error.description[0];
    }

    if (typeof error.error?.icon?.[0] === 'string') {
      return error.error.icon[0];
    }

    if (typeof error.error?.non_field_errors?.[0] === 'string') {
      return error.error.non_field_errors[0];
    }

    return 'Unable to create the organization right now.';
  }
}

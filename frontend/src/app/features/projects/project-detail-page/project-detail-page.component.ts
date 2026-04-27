import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';

import {
  OrganizationMember,
  OrganizationsService,
} from '../../../core/services/organizations.service';
import {
  ProjectListItem,
  ProjectMembership,
  ProjectsService,
} from '../../../core/services/projects.service';
import { OrganizationContextService } from '../../../core/services/organization-context.service';

@Component({
  selector: 'app-project-detail-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, ConfirmDialogComponent],
  templateUrl: './project-detail-page.component.html',
  styleUrl: './project-detail-page.component.css',
})
export class ProjectDetailPageComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly projectsService = inject(ProjectsService);
  private readonly organizationsService = inject(OrganizationsService);
  private readonly organizationContext = inject(OrganizationContextService);
  private readonly authService = inject(AuthService);

  protected readonly isEditing = signal(false);
  protected readonly selectedOrganization =
    this.organizationContext.selectedOrganization;

  protected readonly isLoading = signal(true);
  protected readonly isSaving = signal(false);
  protected readonly isAddingMember = signal(false);

  protected readonly errorMessage = signal<string | null>(null);
  protected readonly saveError = signal<string | null>(null);
  protected readonly saveSuccess = signal<string | null>(null);
  protected readonly memberError = signal<string | null>(null);

  protected readonly project = signal<ProjectListItem | null>(null);
  protected readonly projectMembers = signal<ProjectMembership[]>([]);
  protected readonly organizationMembers = signal<OrganizationMember[]>([]);
  protected readonly removingMemberId = signal<number | null>(null);
  protected readonly deleteDialogOpen = signal(false);
  protected readonly deleteProjectBusy = signal(false);

  protected removeProjectMember(member: ProjectMembership): void {
    const project = this.project();

    if (!project) {
      return;
    }

    this.removingMemberId.set(member.id);
    this.memberError.set(null);

    this.projectsService
      .removeProjectMember(project.id, member.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.projectMembers.update((list) =>
            list.filter((item) => item.id !== member.id),
          );
          this.removingMemberId.set(null);
        },
        error: (error: HttpErrorResponse) => {
          this.removingMemberId.set(null);
          this.memberError.set(this.parseError(error, 'Could not remove member.'));
        },
      });
  }

  protected openDeleteProjectDialog(): void {
    this.deleteDialogOpen.set(true);
  }

  protected closeDeleteProjectDialog(): void {
    if (this.deleteProjectBusy()) {
      return;
    }

    this.deleteDialogOpen.set(false);
  }

  protected confirmDeleteProject(): void {
    const project = this.project();

    if (!project) {
      return;
    }

    this.deleteProjectBusy.set(true);

    this.projectsService
      .deleteProject(project.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.deleteProjectBusy.set(false);
          this.deleteDialogOpen.set(false);
          void this.router.navigate(['/app/projects']);
        },
        error: (error: HttpErrorResponse) => {
          this.deleteProjectBusy.set(false);
          this.saveError.set(this.parseError(error, 'Could not delete project.'));
        },
      });
  }

  protected isOrganizationOwner(member: ProjectMembership): boolean {
    return this.organizationMembers().some(
      (orgMember) => orgMember.user === member.user && orgMember.role === 'admin',
    );
  }

  protected isCurrentUserProjectManager(): boolean {
    const project = this.project();
    const currentUser = this.authService.user();

    if (!project || !currentUser) {
      return false;
    }

    return project.manager_email === currentUser.email;
  }

  protected canRemoveProjectMember(member: ProjectMembership): boolean {
    const selectedOrganization = this.selectedOrganization();

    if (!selectedOrganization || !this.canManageProject()) {
      return false;
    }

    if (this.isOrganizationOwner(member)) {
      return false;
    }

    if (
      this.isCurrentUserProjectManager() &&
      selectedOrganization.role !== 'admin' &&
      member.user === this.project()?.manager
    ) {
      return false;
    }

    return true;
  }

  protected readonly canManageProject = computed(() => {
    const project = this.project();
    const selectedOrganization = this.selectedOrganization();
    const currentUser = this.authService.user();

    if (!project || !selectedOrganization || !currentUser) {
      return false;
    }

    return (
      selectedOrganization.role === 'admin' ||
      project.manager_email === currentUser.email
    );
  });

  protected readonly editProjectForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    description: [''],
    manager: [null as number | null],
    start_date: [''],
    end_date: [''],
  });

  protected readonly addMemberForm = this.fb.nonNullable.group({
    user: [null as number | null, Validators.required],
  });

  constructor() {
    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const projectId = Number(params.get('id'));

        if (!Number.isInteger(projectId) || projectId <= 0) {
          void this.router.navigateByUrl('/app/projects');
          return;
        }

        this.loadProject(projectId);
      });
  }

  protected deleteProject(): void {
    if (!this.project()) return;

    const confirmed = confirm('Are you sure you want to delete this project?');

    if (!confirmed) return;

    this.projectsService
      .deleteProject(this.project()!.id)
      .subscribe({
        next: () => {
          this.router.navigate(['/app/projects']);
        },
      });
  }

  protected startEditing(): void {
    this.isEditing.set(true);
  }

  protected cancelEditing(): void {
    const project = this.project();
    if (project) {
      this.patchProjectForm(project);
    }
    this.isEditing.set(false);
  }

  protected formatDate(iso: string | null): string {
    if (!iso) {
      return '—';
    }

    const date = new Date(iso);

    if (Number.isNaN(date.getTime())) {
      return iso;
    }

    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  protected saveProject(): void {
    const project = this.project();

    if (!project) {
      return;
    }

    if (this.editProjectForm.invalid) {
      this.editProjectForm.markAllAsTouched();
      return;
    }

    const { name, description, manager, start_date, end_date } =
      this.editProjectForm.getRawValue();

    this.isSaving.set(true);
    this.saveError.set(null);
    this.saveSuccess.set(null);

    this.projectsService
      .updateProject(project.id, {
        name: name.trim(),
        description: description.trim(),
        manager,
        start_date: start_date || null,
        end_date: end_date || null,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updatedProject) => {
          this.project.set(updatedProject);
          this.patchProjectForm(updatedProject);
          this.isSaving.set(false);
          this.saveSuccess.set('Project changes saved.');

          this.isEditing.set(false); // ← ВОТ ЭТО ДОБАВЬ
        },
        error: (error: HttpErrorResponse) => {
          this.isSaving.set(false);
          this.saveError.set(this.parseError(error, 'Could not save project.'));
        },
      });
  }

  protected addMemberToProject(): void {
    const project = this.project();

    if (!project) {
      return;
    }

    if (this.addMemberForm.invalid) {
      this.addMemberForm.markAllAsTouched();
      return;
    }

    const { user } = this.addMemberForm.getRawValue();

    if (!user) {
      return;
    }

    this.isAddingMember.set(true);
    this.memberError.set(null);

    this.projectsService
      .addProjectMember({
        project: project.id,
        user,
        project_role: null,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (membership) => {
          this.projectMembers.update((list) => {
            const exists = list.some((item) => item.id === membership.id);
            return exists ? list : [...list, membership];
          });

          this.addMemberForm.reset({ user: null }, { emitEvent: false });
          this.isAddingMember.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.isAddingMember.set(false);
          this.memberError.set(this.parseError(error, 'Could not add member.'));
        },
      });
  }

  protected canChangeProjectManager(): boolean {
    return this.selectedOrganization()?.role === 'admin';
  }

  protected availableOrganizationMembers(): OrganizationMember[] {
    const projectUserIds = new Set(
      this.projectMembers().map((member) => member.user),
    );

    return this.organizationMembers().filter(
      (member) => !projectUserIds.has(member.user),
    );
  }

  protected reload(): void {
    const project = this.project();
    if (project) {
      this.loadProject(project.id);
    }
  }

  private loadProject(projectId: number): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.projectsService
      .getProjectById(projectId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (project) => {
          this.project.set(project);
          this.patchProjectForm(project);

          forkJoin({
            projectMembers: this.projectsService.getProjectMembers(project.id),
            organizationMembers:
              this.organizationsService.getOrganizationMembers(
                project.organization,
              ),
          })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: ({ projectMembers, organizationMembers }) => {
                this.projectMembers.set(projectMembers);
                this.organizationMembers.set(organizationMembers);
                this.isLoading.set(false);
              },
              error: () => {
                this.errorMessage.set('Could not load project members.');
                this.isLoading.set(false);
              },
            });
        },
        error: () => {
          this.errorMessage.set('Unable to load this project.');
          this.isLoading.set(false);
        },
      });
  }

  private patchProjectForm(project: ProjectListItem): void {
    this.editProjectForm.reset(
      {
        name: project.name,
        description: project.description,
        manager: project.manager,
        start_date: project.start_date ?? '',
        end_date: project.end_date ?? '',
      },
      { emitEvent: false },
    );

    if (this.canChangeProjectManager()) {
      this.editProjectForm.controls.manager.enable({ emitEvent: false });
    } else {
      this.editProjectForm.controls.manager.disable({ emitEvent: false });
    }
  }

  private parseError(error: HttpErrorResponse, fallback: string): string {
    if (typeof error.error?.detail === 'string') {
      return error.error.detail;
    }

    if (typeof error.error?.non_field_errors?.[0] === 'string') {
      return error.error.non_field_errors[0];
    }

    if (typeof error.error?.name?.[0] === 'string') {
      return error.error.name[0];
    }

    if (typeof error.error === 'string') {
      return error.error;
    }

    return fallback;
  }
}

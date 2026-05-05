import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { environment } from '../../../../environments/environment';

import { OrganizationContextService } from '../../../core/services/organization-context.service';
import { OrganizationsService } from '../../../core/services/organizations.service';
import {
  ProjectListItem,
  ProjectTeamRolePreview,
  ProjectsService,
} from '../../../core/services/projects.service';
import { AuthService } from '../../../core/services/auth.service';

interface ProjectMemberOption {
  id: number;
  email: string;
  role: string;
}

@Component({
  selector: 'app-projects-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './projects-page.component.html',
  styleUrl: './projects-page.component.css',
})
export class ProjectsPageComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);
  private readonly projectsService = inject(ProjectsService);
  private readonly organizationsService = inject(OrganizationsService);
  private readonly organizationContext = inject(OrganizationContextService);
  private readonly authService = inject(AuthService);

  protected readonly selectedOrganization =
    this.organizationContext.selectedOrganization;

  protected readonly isLoading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly projects = signal<ProjectListItem[]>([]);

  protected readonly showCreateForm = signal(false);
  protected readonly isCreating = signal(false);
  protected readonly createError = signal<string | null>(null);
  protected readonly createSuccess = signal<string | null>(null);

  protected readonly membersLoading = signal(false);
  protected readonly organizationMembers = signal<ProjectMemberOption[]>([]);

  protected readonly canCreateProject = computed(
    () => this.selectedOrganization()?.role === 'admin',
  );

  protected readonly visibleProjects = computed(() => {
    const selectedOrganization = this.selectedOrganization();

    if (!selectedOrganization) {
      return [];
    }

    return this.projects().filter(
      (project) => project.organization === selectedOrganization.id,
    );
  });

  protected readonly createProjectForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    description: [''],
    manager: [null as number | null],
    start_date: [''],
    end_date: [''],
  });

  constructor() {
    this.loadProjects();

    effect(() => {
      const selectedOrganization = this.selectedOrganization();

      this.showCreateForm.set(false);
      this.createError.set(null);
      this.createSuccess.set(null);
      this.resetCreateForm();

      if (selectedOrganization) {
        this.loadProjects();
        this.loadOrganizationMembers(selectedOrganization.id);
      } else {
        this.projects.set([]);
        this.organizationMembers.set([]);
        this.isLoading.set(false);
      }
    });
  }

  protected canEditProject(project: ProjectListItem): boolean {
    const selectedOrganization = this.selectedOrganization();
    const currentUser = this.authService.user();

    if (!selectedOrganization || !currentUser) {
      return false;
    }

    const isOrganizationOwner = selectedOrganization.role === 'admin';

    const isProjectManager =
      project.manager === currentUser.id ||
      project.manager_email === currentUser.email;

    return isOrganizationOwner || isProjectManager;
  }

  protected resolveMediaUrl(url: string | null | undefined): string | null {
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

  protected getProjectManagerMember(project: ProjectListItem): ProjectTeamRolePreview | null {
    if (!project.manager && !project.manager_email) {
      return null;
    }

    return (
      (project.team_roles ?? []).find((member) => {
        const sameId = project.manager !== null && member.user === project.manager;
        const sameEmail =
          !!project.manager_email &&
          member.user_email.toLowerCase() === project.manager_email.toLowerCase();

        return sameId || sameEmail;
      }) ?? null
    );
  }

  protected getProjectManagerAvatar(project: ProjectListItem): string | null {
    return this.resolveMediaUrl(this.getProjectManagerMember(project)?.user_avatar);
  }

  protected openCreateForm(): void {
    if (!this.canCreateProject()) {
      return;
    }

    this.createError.set(null);
    this.createSuccess.set(null);
    this.showCreateForm.set(true);
  }

  protected cancelCreateForm(): void {
    this.showCreateForm.set(false);
    this.createError.set(null);
    this.createSuccess.set(null);
    this.resetCreateForm();
  }

  protected createProject(): void {
    const selectedOrganization = this.selectedOrganization();

    if (!selectedOrganization) {
      this.createError.set('Select an organization before creating a project.');
      return;
    }

    if (!this.canCreateProject()) {
      this.createError.set(
        'Only organization owners can create projects in this workspace.',
      );
      return;
    }

    if (this.createProjectForm.invalid) {
      this.createProjectForm.markAllAsTouched();
      return;
    }

    const { name, description, manager, start_date, end_date } =
      this.createProjectForm.getRawValue();

    this.isCreating.set(true);
    this.createError.set(null);
    this.createSuccess.set(null);

    this.projectsService
      .createProject({
        organization: selectedOrganization.id,
        name: name.trim(),
        description: description.trim(),
        manager,
        start_date: start_date || null,
        end_date: end_date || null,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (project) => {
          this.projects.update((list) => [project, ...list]);
          this.isCreating.set(false);
          this.showCreateForm.set(false);
          this.createSuccess.set('Project created.');
          this.resetCreateForm();
        },
        error: (error: HttpErrorResponse) => {
          this.isCreating.set(false);
          this.createError.set(this.parseError(error, 'Could not create project.'));
        },
      });
  }

  protected reloadProjects(): void {
    this.loadProjects();
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

  protected getVisibleTeamRoles(project: ProjectListItem): ProjectTeamRolePreview[] {
    return this.getAssignedTeamRoles(project).slice(0, 4);
  }

  protected getHiddenTeamRolesCount(project: ProjectListItem): number {
    const count = this.getAssignedTeamRoles(project).length - 4;

    return Math.max(0, count);
  }

  protected hasAssignedTeamRoles(project: ProjectListItem): boolean {
    return this.getAssignedTeamRoles(project).length > 0;
  }

  protected getAssignedTeamRoles(project: ProjectListItem): ProjectTeamRolePreview[] {
    return [...(project.team_roles ?? [])]
      .filter((member) => !!member.project_role_name)
      .sort((a, b) => {
        const roleCompare = String(a.project_role_name).localeCompare(
          String(b.project_role_name),
        );

        if (roleCompare !== 0) {
          return roleCompare;
        }

        return a.user_email.localeCompare(b.user_email);
      });
  }

  protected getProjectMembersWithoutRole(project: ProjectListItem): number {
    return (project.team_roles ?? []).filter(
      (member) => !member.project_role_name,
    ).length;
  }

  protected getUserInitials(email: string): string {
    return email.slice(0, 2).toUpperCase();
  }

  private loadProjects(): void {
    const selectedOrganization = this.selectedOrganization();

    if (!selectedOrganization) {
      this.projects.set([]);
      this.isLoading.set(false);
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.projectsService
      .getMyProjects(selectedOrganization.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (projects) => {
          this.projects.set(projects);
          this.isLoading.set(false);
        },
        error: () => {
          this.projects.set([]);
          this.errorMessage.set('Unable to load projects right now.');
          this.isLoading.set(false);
        },
      });
  }

  private loadOrganizationMembers(organizationId: number): void {
    this.membersLoading.set(true);

    this.organizationsService
      .getOrganizationMembers(organizationId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (members) => {
          this.organizationMembers.set(
            members.map((member) => ({
              id: member.user,
              email: member.user_email,
              role: member.role,
            })),
          );
          this.membersLoading.set(false);
        },
        error: () => {
          this.organizationMembers.set([]);
          this.membersLoading.set(false);
        },
      });
  }

  private resetCreateForm(): void {
    this.createProjectForm.reset(
      {
        name: '',
        description: '',
        manager: null,
        start_date: '',
        end_date: '',
      },
      { emitEvent: false },
    );

    this.createProjectForm.markAsPristine();
    this.createProjectForm.markAsUntouched();
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

import { Component, DestroyRef, Input, OnChanges, SimpleChanges, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { environment } from '../../../../environments/environment';
import {
  ProjectMembership,
  ProjectRole,
  ProjectsService,
} from '../../../core/services/projects.service';

@Component({
  selector: 'app-project-roles',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './project-roles.component.html',
  styleUrl: './project-roles.component.css',
})
export class ProjectRolesComponent implements OnChanges {
  @Input({ required: true }) projectId!: number;

  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly projectsService = inject(ProjectsService);

  protected readonly isLoading = signal(true);
  protected readonly isCreating = signal(false);
  protected readonly isSavingRole = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly createError = signal<string | null>(null);
  protected readonly editError = signal<string | null>(null);

  protected readonly roles = signal<ProjectRole[]>([]);
  protected readonly members = signal<ProjectMembership[]>([]);
  protected readonly editingRoleId = signal<number | null>(null);

  protected readonly roleForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
  });

  protected readonly editRoleForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
  });

  protected readonly assignedMembers = computed(() =>
    this.members().filter((member) => member.project_role !== null),
  );

  protected readonly unassignedMembers = computed(() =>
    this.members().filter((member) => member.project_role === null),
  );

  protected readonly rolesWithMembers = computed(() => {
    return this.roles().map((role) => ({
      role,
      members: this.members().filter(
        (member) => member.project_role === role.id,
      ),
    }));
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['projectId'] && this.projectId) {
      this.loadData();
    }
  }

  protected reload(): void {
    this.loadData();
  }

  protected createRole(): void {
    if (this.roleForm.invalid) {
      this.roleForm.markAllAsTouched();
      return;
    }

    const name = this.roleForm.controls.name.value.trim();

    if (!name) {
      this.roleForm.controls.name.setErrors({ required: true });
      return;
    }

    this.isCreating.set(true);
    this.createError.set(null);

    this.projectsService
      .createProjectRole({
        project: this.projectId,
        name,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (role) => {
          this.roles.update((roles) => [...roles, role]);
          this.roleForm.reset({ name: '' }, { emitEvent: false });
          this.isCreating.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.createError.set(this.parseError(error, 'Could not create role.'));
          this.isCreating.set(false);
        },
      });
  }

  protected startEditRole(role: ProjectRole): void {
    this.editingRoleId.set(role.id);
    this.editError.set(null);
    this.editRoleForm.reset({ name: role.name }, { emitEvent: false });
  }

  protected cancelEditRole(): void {
    this.editingRoleId.set(null);
    this.editError.set(null);
    this.editRoleForm.reset({ name: '' }, { emitEvent: false });
  }

  protected saveRole(role: ProjectRole): void {
    if (this.editRoleForm.invalid) {
      this.editRoleForm.markAllAsTouched();
      return;
    }

    const name = this.editRoleForm.controls.name.value.trim();

    if (!name) {
      this.editRoleForm.controls.name.setErrors({ required: true });
      return;
    }

    this.isSavingRole.set(true);
    this.editError.set(null);

    this.projectsService
      .updateProjectRole(role.id, { name })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updatedRole) => {
          this.roles.update((roles) =>
            roles.map((item) =>
              item.id === updatedRole.id ? updatedRole : item,
            ),
          );

          this.members.update((members) =>
            members.map((member) =>
              member.project_role === updatedRole.id
                ? { ...member, project_role_name: updatedRole.name }
                : member,
            ),
          );

          this.isSavingRole.set(false);
          this.cancelEditRole();
        },
        error: (error: HttpErrorResponse) => {
          this.editError.set(this.parseError(error, 'Could not update role.'));
          this.isSavingRole.set(false);
        },
      });
  }

  protected deleteRole(role: ProjectRole): void {
    const confirmed = window.confirm(
      `Delete role “${role.name}”? Members with this role will become unassigned.`,
    );

    if (!confirmed) {
      return;
    }

    this.projectsService
      .deleteProjectRole(role.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.roles.update((roles) =>
            roles.filter((item) => item.id !== role.id),
          );

          this.members.update((members) =>
            members.map((member) =>
              member.project_role === role.id
                ? {
                    ...member,
                    project_role: null,
                    project_role_name: null,
                  }
                : member,
            ),
          );
        },
        error: (error: HttpErrorResponse) => {
          this.errorMessage.set(this.parseError(error, 'Could not delete role.'));
        },
      });
  }

  protected setMemberRole(member: ProjectMembership, event: Event): void {
    const select = event.target as HTMLSelectElement;
    const value = select.value ? Number(select.value) : null;

    this.members.update((members) =>
      members.map((item) =>
        item.id === member.id
          ? {
              ...item,
              project_role: value,
              project_role_name:
                this.roles().find((role) => role.id === value)?.name ?? null,
            }
          : item,
      ),
    );

    this.projectsService
      .updateProjectMemberRole(this.projectId, member.id, {
        project_role: value,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updatedMember) => {
          this.members.update((members) =>
            members.map((item) =>
              item.id === updatedMember.id ? updatedMember : item,
            ),
          );
        },
        error: (error: HttpErrorResponse) => {
          this.errorMessage.set(
            this.parseError(error, 'Could not update member role.'),
          );
          this.loadData();
        },
      });
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

  protected getInitials(email: string): string {
    return email.slice(0, 2).toUpperCase();
  }

  protected roleMembersCount(roleId: number): number {
    return this.members().filter((member) => member.project_role === roleId).length;
  }

  private loadData(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.createError.set(null);
    this.editError.set(null);

    forkJoin({
      roles: this.projectsService.getProjectRoles(this.projectId),
      members: this.projectsService.getProjectMembers(this.projectId),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ roles, members }) => {
          this.roles.set(roles);
          this.members.set(members);
          this.isLoading.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.roles.set([]);
          this.members.set([]);
          this.errorMessage.set(
            this.parseError(error, 'Could not load project roles.'),
          );
          this.isLoading.set(false);
        },
      });
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

    if (typeof error.error?.project_role?.[0] === 'string') {
      return error.error.project_role[0];
    }

    if (typeof error.error === 'string') {
      return error.error;
    }

    return fallback;
  }
}

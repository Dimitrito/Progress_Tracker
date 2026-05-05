import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';

import { OrganizationContextService } from '../../../core/services/organization-context.service';
import {
  ProjectListItem,
  ProjectsService,
} from '../../../core/services/projects.service';
import { ProjectGanttComponent } from '../../projects/project-gantt/project-gantt.component';
import { ProjectMetricsComponent } from '../../projects/project-metrics/project-metrics.component';
import { ProjectRolesComponent } from '../../projects/project-roles/project-roles.component';
import { TaskBoardComponent } from '../task-board/task-board.component';
import { UserMetricsComponent } from '../../projects/user-metrics/user-metrics.component';

type TaskView =
  | 'board'
  | 'project-metrics'
  | 'user-metrics'
  | 'gantt'
  | 'roles'
  | 'table'
  | 'settings';

@Component({
  selector: 'app-tasks-page',
  standalone: true,
  imports: [
    TaskBoardComponent,
    ProjectMetricsComponent,
    UserMetricsComponent,
    ProjectGanttComponent,
    ProjectRolesComponent,
  ],
  templateUrl: './tasks-page.component.html',
  styleUrl: './tasks-page.component.css',
})
export class TasksPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly projectsService = inject(ProjectsService);
  private readonly organizationContext = inject(OrganizationContextService);

  protected readonly projectId = signal<number>(
    Number(this.route.snapshot.paramMap.get('id')),
  );

  protected readonly activeView = signal<TaskView>('board');
  protected readonly project = signal<ProjectListItem | null>(null);

  protected readonly selectedOrganization =
    this.organizationContext.selectedOrganization;

  protected readonly canManageProjectRoles = computed(() => {
    const organization = this.selectedOrganization();
    const project = this.project();

    const organizationRole = String(organization?.role ?? '').toLowerCase();
    const isOwnerOrAdmin =
      organizationRole === 'owner' ||
      organizationRole === 'admin';

    const currentUserEmail = this.getCurrentUserEmail();
    const isProjectManager =
      !!project?.manager_email &&
      !!currentUserEmail &&
      project.manager_email.toLowerCase() === currentUserEmail.toLowerCase();

    return isOwnerOrAdmin || isProjectManager;
  });

  constructor() {
    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const nextProjectId = Number(params.get('id'));

        if (!nextProjectId) {
          this.project.set(null);
          return;
        }

        this.projectId.set(nextProjectId);
        this.activeView.set('board');
        this.loadProject();
      });
  }

  protected setActiveView(view: TaskView): void {
    if (view === 'roles' && !this.canManageProjectRoles()) {
      return;
    }

    this.activeView.set(view);
  }

  private loadProject(): void {
    const currentProjectId = this.projectId();

    if (!currentProjectId) {
      this.project.set(null);
      return;
    }

    this.projectsService
      .getProjectById(currentProjectId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (project) => this.project.set(project),
        error: () => this.project.set(null),
      });
  }

  private getCurrentUserEmail(): string | null {
    const directKeys = [
      'email',
      'user_email',
      'current_user_email',
    ];

    for (const key of directKeys) {
      const value = localStorage.getItem(key);

      if (value) {
        return value.replaceAll('"', '');
      }
    }

    const userPayloadKeys = [
      'user',
      'currentUser',
      'auth_user',
    ];

    for (const key of userPayloadKeys) {
      const value = localStorage.getItem(key);

      if (!value) {
        continue;
      }

      try {
        const parsed = JSON.parse(value);

        if (typeof parsed?.email === 'string') {
          return parsed.email;
        }

        if (typeof parsed?.user_email === 'string') {
          return parsed.user_email;
        }
      } catch {
        continue;
      }
    }

    const tokenKeys = [
      'access',
      'access_token',
      'token',
      'jwt',
    ];

    for (const key of tokenKeys) {
      const token = localStorage.getItem(key);

      if (!token) {
        continue;
      }

      const email = this.getEmailFromJwt(token);

      if (email) {
        return email;
      }
    }

    return null;
  }

  private getEmailFromJwt(token: string): string | null {
    const parts = token.split('.');

    if (parts.length < 2) {
      return null;
    }

    try {
      const payload = JSON.parse(atob(parts[1]));

      if (typeof payload?.email === 'string') {
        return payload.email;
      }

      if (typeof payload?.user_email === 'string') {
        return payload.user_email;
      }

      return null;
    } catch {
      return null;
    }
  }
}

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
import { AuthService } from '../../../core/services/auth.service';

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
  private readonly authService = inject(AuthService);

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
    const currentUser = this.authService.user();

    const organizationRole = String(organization?.role ?? '').toLowerCase();
    const isOwnerOrAdmin =
      organizationRole === 'owner' ||
      organizationRole === 'admin';

    const isProjectManager =
      !!project &&
      !!currentUser &&
      (
        project.manager === currentUser.id ||
        (
          !!project.manager_email &&
          !!currentUser.email &&
          project.manager_email.toLowerCase() === currentUser.email.toLowerCase()
        )
      );

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
}

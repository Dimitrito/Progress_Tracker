import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';

import { environment } from '../../../../environments/environment';
import {
  ProjectListItem,
  ProjectMembership,
  ProjectsService,
} from '../../../core/services/projects.service';
import {
  TaskItem,
  TaskPriority,
  TaskTag,
  TasksService,
} from '../../../core/services/tasks.service';
import { OrganizationContextService } from '../../../core/services/organization-context.service';
import { TaskModalComponent } from '../../tasks/task-modal/task-modal.component';

type MyTasksFilter = 'open' | 'completed' | 'all';

@Component({
  selector: 'app-my-tasks',
  standalone: true,
  imports: [TaskModalComponent],
  templateUrl: './my-tasks.component.html',
  styleUrl: './my-tasks.component.css',
})
export class MyTasksComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly tasksService = inject(TasksService);
  private readonly projectsService = inject(ProjectsService);
  private readonly organizationContext = inject(OrganizationContextService);

  protected readonly selectedOrganization =
    this.organizationContext.selectedOrganization;

  protected readonly isLoading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly tasks = signal<TaskItem[]>([]);
  protected readonly projects = signal<ProjectListItem[]>([]);

  protected readonly activeFilter = signal<MyTasksFilter>('open');

  protected readonly selectedTaskId = signal<number | null>(null);
  protected readonly selectedProjectMembers = signal<ProjectMembership[]>([]);
  protected readonly selectedProjectTags = signal<TaskTag[]>([]);

  protected readonly priorityOptions = [
    { value: 'urgent', label: 'Urgent', icon: '🚩' },
    { value: 'high', label: 'High', icon: '🟧' },
    { value: 'normal', label: 'Normal', icon: '🟦' },
    { value: 'low', label: 'Low', icon: '⬜' },
  ] as const;

  protected readonly projectMap = computed(() => {
    const map = new Map<number, ProjectListItem>();

    for (const project of this.projects()) {
      map.set(project.id, project);
    }

    return map;
  });

  protected readonly workspaceProjects = computed(() => {
    const selectedOrganization = this.selectedOrganization();

    if (!selectedOrganization) {
      return [];
    }

    return this.projects().filter(
      (project) => project.organization === selectedOrganization.id,
    );
  });

  protected readonly workspaceProjectIds = computed(() => {
    return new Set(this.workspaceProjects().map((project) => project.id));
  });

  protected readonly workspaceTasks = computed(() => {
    const selectedOrganization = this.selectedOrganization();

    if (!selectedOrganization) {
      return [];
    }

    const projectIds = this.workspaceProjectIds();

    return this.tasks().filter((task) => projectIds.has(task.project));
  });

  protected readonly filteredTasks = computed(() => {
    const filter = this.activeFilter();

    return this.workspaceTasks()
      .filter((task) => {
        if (filter === 'open') {
          return !task.is_completed;
        }

        if (filter === 'completed') {
          return task.is_completed;
        }

        return true;
      })
      .sort((a, b) => {
        const aDeadline = a.deadline ?? '9999-12-31';
        const bDeadline = b.deadline ?? '9999-12-31';

        return (
          aDeadline.localeCompare(bDeadline) ||
          a.group_name.localeCompare(b.group_name) ||
          a.position - b.position ||
          a.id - b.id
        );
      });
  });

  protected readonly openTasksCount = computed(
    () => this.workspaceTasks().filter((task) => !task.is_completed).length,
  );

  protected readonly completedTasksCount = computed(
    () => this.workspaceTasks().filter((task) => task.is_completed).length,
  );

  protected readonly allTasksCount = computed(() => this.workspaceTasks().length);

  protected readonly groupedByProject = computed(() => {
    const map = new Map<number, TaskItem[]>();

    for (const task of this.filteredTasks()) {
      const list = map.get(task.project) ?? [];
      list.push(task);
      map.set(task.project, list);
    }

    return Array.from(map.entries()).map(([projectId, tasks]) => ({
      projectId,
      projectName: this.getProjectName(projectId),
      tasks,
    }));
  });

  constructor() {
    this.loadMyTasks();
  }

  protected setFilter(filter: MyTasksFilter): void {
    this.activeFilter.set(filter);
  }

  protected reload(): void {
    this.loadMyTasks();
  }

  protected getProjectName(projectId: number): string {
    return this.projectMap().get(projectId)?.name ?? `Project #${projectId}`;
  }

  protected getTaskGroupName(task: TaskItem): string {
    return task.group_name || 'No group';
  }

  protected getPriorityLabel(priority: TaskPriority | null): string {
    if (!priority) {
      return 'No priority';
    }

    return (
      this.priorityOptions.find((item) => item.value === priority)?.label ??
      priority
    );
  }

  protected getPriorityIcon(priority: TaskPriority | null): string {
    if (!priority) {
      return '⚑';
    }

    return (
      this.priorityOptions.find((item) => item.value === priority)?.icon ??
      '⚑'
    );
  }

  protected getPriorityClass(priority: TaskPriority | null): string {
    if (!priority) {
      return 'priority-none';
    }

    return `priority-${priority}`;
  }

  protected openTask(task: TaskItem): void {
    this.selectedTaskId.set(task.id);
    this.selectedProjectMembers.set([]);
    this.selectedProjectTags.set([]);

    forkJoin({
      members: this.projectsService.getProjectMembers(task.project),
      tags: this.tasksService.getProjectTags(task.project),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ members, tags }) => {
          this.selectedProjectMembers.set(members);
          this.selectedProjectTags.set(tags);
        },
        error: () => {
          this.selectedProjectMembers.set([]);
          this.selectedProjectTags.set([]);
        },
      });
  }

  protected closeTaskModal(): void {
    this.selectedTaskId.set(null);
    this.selectedProjectMembers.set([]);
    this.selectedProjectTags.set([]);
  }

  protected handleTaskUpdated(updatedTask: TaskItem): void {
    this.tasks.update((tasks) =>
      tasks.map((task) => (task.id === updatedTask.id ? updatedTask : task)),
    );
  }

  protected handleTaskDeleted(taskId: number): void {
    this.closeTaskModal();
    this.tasks.update((tasks) => tasks.filter((task) => task.id !== taskId));
    this.loadMyTasks();
  }

  protected handleTagCreated(tag: TaskTag): void {
    this.selectedProjectTags.update((tags) =>
      tags.some((item) => item.id === tag.id) ? tags : [...tags, tag],
    );
  }

  protected toggleTaskCompleted(task: TaskItem, event: Event): void {
    event.stopPropagation();

    const nextIsCompleted = !task.is_completed;

    this.tasks.update((tasks) =>
      tasks.map((item) =>
        item.id === task.id
          ? {
              ...item,
              is_completed: nextIsCompleted,
              completed_at: nextIsCompleted
                ? item.completed_at ?? new Date().toISOString()
                : null,
            }
          : item,
      ),
    );

    this.tasksService
      .updateTask(task.id, { is_completed: nextIsCompleted })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updatedTask) => this.handleTaskUpdated(updatedTask),
        error: () => this.loadMyTasks(),
      });
  }

  protected formatDeadline(deadline: string | null): string {
    if (!deadline) {
      return 'No deadline';
    }

    const date = new Date(`${deadline}T00:00:00`);
    const today = new Date();
    const tomorrow = new Date();

    today.setHours(0, 0, 0, 0);
    tomorrow.setHours(0, 0, 0, 0);
    tomorrow.setDate(today.getDate() + 1);

    if (date.getTime() === today.getTime()) {
      return 'Today';
    }

    if (date.getTime() === tomorrow.getTime()) {
      return 'Tomorrow';
    }

    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  protected isOverdue(deadline: string | null): boolean {
    if (!deadline) {
      return false;
    }

    const date = new Date(`${deadline}T00:00:00`);
    const today = new Date();

    today.setHours(0, 0, 0, 0);

    return date.getTime() < today.getTime();
  }

  protected getActiveStoryPoints(task: TaskItem): number {
    const value = Number(task.active_story_points);

    if (!Number.isFinite(value) || value <= 0) {
      return 0;
    }

    return Math.floor(value);
  }

  protected shouldShowStoryPoints(task: TaskItem): boolean {
    return this.getActiveStoryPoints(task) > 0;
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

  private loadMyTasks(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    forkJoin({
      tasks: this.tasksService.getMyTasks(),
      projects: this.projectsService.getMyProjects(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ tasks, projects }) => {
          this.tasks.set(tasks);
          this.projects.set(projects);
          this.isLoading.set(false);
        },
        error: () => {
          this.tasks.set([]);
          this.projects.set([]);
          this.errorMessage.set('Could not load your assigned tasks.');
          this.isLoading.set(false);
        },
      });
  }
}

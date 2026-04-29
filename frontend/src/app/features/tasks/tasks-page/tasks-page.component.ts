import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, HostListener, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import {
  CdkDragDrop,
  DragDropModule,
  moveItemInArray,
  transferArrayItem,
} from '@angular/cdk/drag-drop';
import { DOCUMENT } from '@angular/common';
import { ProjectsService, ProjectListItem } from '../../../core/services/projects.service';
import {
  TaskGroup,
  TaskItem,
  TasksService,
} from '../../../core/services/tasks.service';

@Component({
  selector: 'app-tasks-page',
  standalone: true,
  imports: [RouterLink, ReactiveFormsModule, DragDropModule],
  templateUrl: './tasks-page.component.html',
  styleUrl: './tasks-page.component.css',
})
export class TasksPageComponent {
  @ViewChild('taskFormElement') taskFormElement?: ElementRef;

  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);
  private readonly tasksService = inject(TasksService);

  protected readonly projectId = Number(this.route.snapshot.paramMap.get('id'));

  protected readonly isLoading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  private readonly document = inject(DOCUMENT);
  protected readonly groups = signal<TaskGroup[]>([]);
  protected readonly tasks = signal<TaskItem[]>([]);

  private readonly projectsService = inject(ProjectsService);
  protected readonly project = signal<ProjectListItem | null>(null);

  protected readonly activeTaskGroupId = signal<number | null>(null);
  protected readonly activeGroupForm = signal(false);
  protected readonly activeGroupOptionsId = signal<number | null>(null);
  protected readonly renamingGroupId = signal<number | null>(null);

  protected readonly isCreatingTask = signal(false);
  protected readonly isCreatingGroup = signal(false);
  protected readonly isRenamingGroup = signal(false);

  protected readonly createTaskError = signal<string | null>(null);
  protected readonly createGroupError = signal<string | null>(null);
  protected readonly renameGroupError = signal<string | null>(null);

  protected readonly selectedRenameColor = signal<string>('');

  @HostListener('document:click', ['$event'])
  protected closeMenusOnOutsideClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;

    if (!target) {
      return;
    }

    if (
      target.closest('.group-options-menu') ||
      target.closest('.group-options-trigger')
    ) {
      return;
    }

    this.activeGroupOptionsId.set(null);
  }

  @HostListener('document:click', ['$event'])
  handleClickOutside(event: MouseEvent): void {
    if (!this.activeTaskGroupId()) return;

    const formEl = this.taskFormElement?.nativeElement;
    if (!formEl) return;

    const target = event.target as HTMLElement;

    if (!formEl.contains(target)) {
      this.cancelTaskForm();
    }
  }

  protected groupDropListId(groupId: number): string {
    return `task-group-${groupId}`;
  }

  protected connectedDropLists(): string[] {
    return this.groups().map((group) => this.groupDropListId(group.id));
  }

  protected startDragging(): void {
    this.document.body.classList.add('task-is-dragging');
  }

  protected stopDragging(): void {
    this.document.body.classList.remove('task-is-dragging');
  }

  protected dropTask(
    event: CdkDragDrop<TaskItem[]>,
    targetGroup: TaskGroup,
  ): void {
    const previousGroupId = Number(
      event.previousContainer.id.replace('task-group-', ''),
    );
    const targetGroupId = targetGroup.id;

    const previousTasks = [...event.previousContainer.data];
    const currentTasks = [...event.container.data];

    if (event.previousContainer === event.container) {
      moveItemInArray(currentTasks, event.previousIndex, event.currentIndex);
    } else {
      transferArrayItem(
        previousTasks,
        currentTasks,
        event.previousIndex,
        event.currentIndex,
      );
    }

    const updates = new Map<number, Partial<TaskItem>>();

    currentTasks.forEach((task, index) => {
      updates.set(task.id, {
        group: targetGroupId,
        group_name: targetGroup.name,
        position: index,
      });
    });

    if (previousGroupId !== targetGroupId) {
      previousTasks.forEach((task, index) => {
        updates.set(task.id, {
          group: previousGroupId,
          position: index,
        });
      });
    }

    this.tasks.update((allTasks) =>
      allTasks.map((task) => {
        const update = updates.get(task.id);

        if (!update) {
          return task;
        }

        return {
          ...task,
          ...update,
        };
      }),
    );

    forkJoin(
      Array.from(updates.entries()).map(([taskId, payload]) =>
        this.tasksService.updateTask(taskId, {
          group: payload.group,
          position: payload.position,
        }),
      ),
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: () => {
          this.loadBoard();
        },
      });
  }

  protected dropGroup(event: CdkDragDrop<TaskGroup[]>): void {
    if (event.previousIndex === event.currentIndex) {
      return;
    }

    const reorderedGroups = [...this.groups()];

    moveItemInArray(reorderedGroups, event.previousIndex, event.currentIndex);

    const groupsWithPositions = reorderedGroups.map((group, index) => ({
      ...group,
      position: index,
    }));

    this.groups.set(groupsWithPositions);

    forkJoin(
      groupsWithPositions.map((group) =>
        this.tasksService.updateGroup(group.id, {
          name: group.name,
          color: group.color,
          position: group.position,
        }),
      ),
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: () => {
          this.loadBoard();
        },
      });
  }

  protected readonly groupColors = [
    '#64748b',
    '#3b82f6',
    '#2563eb',
    '#06b6d4',
    '#14b8a6',
    '#22c55e',
    '#f59e0b',
    '#f97316',
    '#ef4444',
    '#ec4899',
    '#a855f7',
    '#8b5cf6',
  ];

  protected readonly taskForm = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(255)]],
  });

  protected readonly groupForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
  });

  protected readonly renameGroupForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
  });

  protected readonly groupedTasks = computed(() => {
    const map = new Map<number, TaskItem[]>();

    for (const group of this.groups()) {
      map.set(group.id, []);
    }

    for (const task of this.tasks()) {
      const list = map.get(task.group) ?? [];
      list.push(task);
      map.set(task.group, list);
    }

    for (const [groupId, list] of map.entries()) {
      map.set(
        groupId,
        [...list].sort((a, b) => a.position - b.position || a.id - b.id),
      );
    }

    return map;
  });

  constructor() {
    this.loadBoard();
    this.projectsService
      .getProjectById(this.projectId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (project) => {
          this.project.set(project);
        },
        error: () => {
          this.project.set(null);
        },
      });
  }

  protected tasksForGroup(groupId: number): TaskItem[] {
    return this.groupedTasks().get(groupId) ?? [];
  }

  protected openTaskForm(groupId: number, event?: MouseEvent): void {
    event?.stopPropagation();

    this.activeTaskGroupId.set(groupId);
    this.activeGroupOptionsId.set(null);
    this.createTaskError.set(null);
    this.taskForm.reset({ title: '' }, { emitEvent: false });
  }

  protected cancelTaskForm(): void {
    this.activeTaskGroupId.set(null);
    this.createTaskError.set(null);
    this.taskForm.reset({ title: '' }, { emitEvent: false });
  }

  protected createTask(group: TaskGroup): void {
    if (this.taskForm.invalid) {
      this.taskForm.markAllAsTouched();
      return;
    }

    const title = this.taskForm.controls.title.value.trim();

    if (!title) {
      this.taskForm.controls.title.setErrors({ required: true });
      return;
    }

    this.isCreatingTask.set(true);
    this.createTaskError.set(null);

    this.tasksService
      .createTask(this.projectId, {
        group: group.id,
        title,
        description: '',
        assignee: null,
        story_points: 1,
        deadline: null,
        position: this.tasksForGroup(group.id).length,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (task) => {
          this.tasks.update((tasks) => [...tasks, task]);
          this.groups.update((groups) =>
            groups.map((item) =>
              item.id === group.id
                ? { ...item, task_count: item.task_count + 1 }
                : item,
            ),
          );

          this.isCreatingTask.set(false);
          this.activeTaskGroupId.set(null);
          this.taskForm.reset({ title: '' }, { emitEvent: false });
        },
        error: (error: HttpErrorResponse) => {
          this.isCreatingTask.set(false);
          this.createTaskError.set(this.parseError(error, 'Could not create task.'));
        },
      });
  }

  protected openGroupForm(): void {
    this.activeGroupForm.set(true);
    this.activeGroupOptionsId.set(null);
    this.createGroupError.set(null);
    this.groupForm.reset({ name: '' }, { emitEvent: false });
  }

  protected cancelGroupForm(): void {
    this.activeGroupForm.set(false);
    this.createGroupError.set(null);
    this.groupForm.reset({ name: '' }, { emitEvent: false });
  }

  protected createGroup(): void {
    if (this.groupForm.invalid) {
      this.groupForm.markAllAsTouched();
      return;
    }

    const name = this.groupForm.controls.name.value.trim();

    if (!name) {
      this.groupForm.controls.name.setErrors({ required: true });
      return;
    }

    this.isCreatingGroup.set(true);
    this.createGroupError.set(null);

    this.tasksService
      .createGroup(this.projectId, {
        name,
        color: '#64748b',
        position: this.groups().length,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (group) => {
          this.groups.update((groups) => [...groups, group]);
          this.isCreatingGroup.set(false);
          this.activeGroupForm.set(false);
          this.groupForm.reset({ name: '' }, { emitEvent: false });
        },
        error: (error: HttpErrorResponse) => {
          this.isCreatingGroup.set(false);
          this.createGroupError.set(
            this.parseError(error, 'Could not create group.'),
          );
        },
      });
  }

  protected toggleGroupOptions(groupId: number): void {
    this.activeGroupOptionsId.update((current) =>
      current === groupId ? null : groupId,
    );
  }

  protected startGroupRename(group: TaskGroup): void {
    this.activeGroupOptionsId.set(null);
    this.renamingGroupId.set(group.id);
    this.renameGroupError.set(null);
    this.selectedRenameColor.set(group.color || '#64748b');

    this.renameGroupForm.reset(
      {
        name: group.name,
      },
      { emitEvent: false },
    );
  }

  protected cancelGroupRename(): void {
    this.renamingGroupId.set(null);
    this.renameGroupError.set(null);
    this.selectedRenameColor.set('');
    this.renameGroupForm.reset({ name: '' }, { emitEvent: false });
  }

  protected selectRenameColor(color: string): void {
    this.selectedRenameColor.set(color);
  }

  protected saveGroupRename(group: TaskGroup): void {
    if (this.renameGroupForm.invalid) {
      this.renameGroupForm.markAllAsTouched();
      return;
    }

    const name = this.renameGroupForm.controls.name.value.trim();

    if (!name) {
      this.renameGroupForm.controls.name.setErrors({ required: true });
      return;
    }

    this.isRenamingGroup.set(true);
    this.renameGroupError.set(null);

    this.tasksService
      .updateGroup(group.id, {
        name,
        color: this.selectedRenameColor() || group.color || '#64748b',
        position: group.position,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updatedGroup) => {
          this.groups.update((groups) =>
            groups.map((item) =>
              item.id === updatedGroup.id ? updatedGroup : item,
            ),
          );

          this.isRenamingGroup.set(false);
          this.renamingGroupId.set(null);
          this.selectedRenameColor.set('');
          this.renameGroupForm.reset({ name: '' }, { emitEvent: false });
        },
        error: (error: HttpErrorResponse) => {
          this.isRenamingGroup.set(false);
          this.renameGroupError.set(
            this.parseError(error, 'Could not rename group.'),
          );
        },
      });
  }

  protected deleteGroup(group: TaskGroup): void {
    this.activeGroupOptionsId.set(null);

    this.tasksService
      .deleteGroup(group.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.groups.update((groups) =>
            groups.filter((item) => item.id !== group.id),
          );
        },
        error: (error: HttpErrorResponse) => {
          this.errorMessage.set(
            this.parseError(error, 'Could not delete group.'),
          );
        },
      });
  }

  protected reload(): void {
    this.loadBoard();
  }

  private loadBoard(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    forkJoin({
      groups: this.tasksService.getProjectGroups(this.projectId),
      tasks: this.tasksService.getProjectTasks(this.projectId),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ groups, tasks }) => {
          this.groups.set(groups);
          this.tasks.set(tasks);
          this.isLoading.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.groups.set([]);
          this.tasks.set([]);
          this.errorMessage.set(this.parseError(error, 'Could not load tasks.'));
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

    if (typeof error.error?.title?.[0] === 'string') {
      return error.error.title[0];
    }

    if (typeof error.error === 'string') {
      return error.error;
    }

    return fallback;
  }
}

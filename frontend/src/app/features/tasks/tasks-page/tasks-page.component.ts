import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import {
  CdkDragDrop, CdkDragStart,
  DragDropModule,
  moveItemInArray,
  transferArrayItem,
} from '@angular/cdk/drag-drop';
import { environment } from '../../../../environments/environment';
import { TaskModalComponent } from '../task-modal/task-modal.component';

import {
  ProjectListItem,
  ProjectMembership,
  ProjectsService,
} from '../../../core/services/projects.service';
import {
  TaskGroup,
  TaskItem,
  TaskTag,
  TasksService, TaskPriority,
} from '../../../core/services/tasks.service';

type TaskPopoverType = 'assignee' | 'deadline' | 'tags' | 'priority' | 'points';

@Component({
  selector: 'app-tasks-page',
  standalone: true,
  imports: [RouterLink, ReactiveFormsModule, DragDropModule, TaskModalComponent],
  templateUrl: './tasks-page.component.html',
  styleUrl: './tasks-page.component.css',
})
export class TasksPageComponent {
  @ViewChild('taskFormElement') taskFormElement?: ElementRef<HTMLElement>;

  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);
  private readonly document = inject(DOCUMENT);
  private readonly tasksService = inject(TasksService);
  private readonly projectsService = inject(ProjectsService);

  protected readonly projectId = Number(this.route.snapshot.paramMap.get('id'));

  protected readonly isLoading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly project = signal<ProjectListItem | null>(null);
  protected readonly groups = signal<TaskGroup[]>([]);
  protected readonly tasks = signal<TaskItem[]>([]);
  protected readonly taskTags = signal<TaskTag[]>([]);
  protected readonly projectMembers = signal<ProjectMembership[]>([]);

  protected readonly activeTaskGroupId = signal<number | null>(null);
  protected readonly activeGroupForm = signal(false);
  protected readonly activeGroupOptionsId = signal<number | null>(null);
  protected readonly renamingGroupId = signal<number | null>(null);
  protected readonly priorityOptions = [
    { value: 'urgent', label: 'Urgent', icon: '🚩' },
    { value: 'high', label: 'High', icon: '🟧' },
    { value: 'normal', label: 'Normal', icon: '🟦' },
    { value: 'low', label: 'Low', icon: '⬜' },
  ] as const;

  protected readonly activeTaskPopover = signal<{
    taskId: number;
    type: TaskPopoverType;
  } | null>(null);

  protected readonly isCreatingTask = signal(false);
  protected readonly isCreatingGroup = signal(false);
  protected readonly isRenamingGroup = signal(false);

  protected readonly createTaskError = signal<string | null>(null);
  protected readonly createGroupError = signal<string | null>(null);
  protected readonly renameGroupError = signal<string | null>(null);

  protected readonly selectedRenameColor = signal<string>('');
  protected readonly activeCreateTaskPopover = signal<TaskPopoverType | null>(null);
  protected readonly selectedCreateTagIds = signal<number[]>([]);
  protected readonly selectedTaskId = signal<number | null>(null);
  protected dragPlaceholderHeight = signal<number | null>(null);

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

  protected openTaskModal(task: TaskItem): void {
    this.selectedTaskId.set(task.id);
    this.activeTaskPopover.set(null);
    this.activeGroupOptionsId.set(null);
  }

  protected closeTaskModal(): void {
    this.selectedTaskId.set(null);
  }

  protected handleModalTaskUpdated(updatedTask: TaskItem): void {
    if (updatedTask.parent_task !== null) {
      return;
    }

    this.replaceTask(updatedTask);
  }

  protected handleModalTaskDeleted(taskId: number): void {
    this.tasks.update((tasks) => tasks.filter((task) => task.id !== taskId));
    this.closeTaskModal();
  }

  protected readonly taskForm = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(255)]],
    assignee: this.fb.control<number | null>(null),
    deadline: this.fb.control<string | null>(null),
    priority: this.fb.control<TaskPriority | null>(null),
    story_points: this.fb.control<number | null>(null),
  });

  protected readonly groupForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
  });

  protected readonly renameGroupForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
  });

  protected readonly tagForm = this.fb.nonNullable.group({
    name: [''],
  });

  protected readonly groupedTasks = computed(() => {
    const map = new Map<number, TaskItem[]>();

    for (const group of this.groups()) {
      map.set(group.id, []);
    }

    for (const task of this.tasks()) {
      if (task.parent_task !== null) {
        continue;
      }

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
    this.loadProject();
  }

  @HostListener('document:click', ['$event'])
  protected handleDocumentClick(event: MouseEvent): void {
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

    if (
      target.closest('.task-action-popover') ||
      target.closest('.task-action-button')
    ) {
      this.activeGroupOptionsId.set(null);
      return;
    }

    if (this.activeTaskGroupId()) {
      const formEl = this.taskFormElement?.nativeElement;

      if (formEl && !formEl.contains(target)) {
        this.cancelTaskForm();
      }
    }

    this.activeGroupOptionsId.set(null);
    this.activeTaskPopover.set(null);
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

  protected groupDropListId(groupId: number): string {
    return `task-group-${groupId}`;
  }

  protected connectedDropLists(): string[] {
    return this.groups().map((group) => this.groupDropListId(group.id));
  }

  protected startDragging(event: CdkDragStart): void {
    const element = event.source.element.nativeElement as HTMLElement;
    this.dragPlaceholderHeight.set(element.offsetHeight);
  }

  protected stopDragging(): void {
    this.dragPlaceholderHeight.set(null);
  }

  protected tasksForGroup(groupId: number): TaskItem[] {
    return this.groupedTasks().get(groupId) ?? [];
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

        return update ? { ...task, ...update } : task;
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
        error: () => this.loadBoard(),
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
        error: () => this.loadBoard(),
      });
  }

  protected openTaskForm(groupId: number, event?: MouseEvent): void {
    event?.stopPropagation();

    this.activeTaskGroupId.set(groupId);
    this.activeGroupOptionsId.set(null);
    this.activeTaskPopover.set(null);
    this.createTaskError.set(null);
    this.taskForm.reset({ title: '' }, { emitEvent: false });
    this.activeCreateTaskPopover.set(null);
    this.selectedCreateTagIds.set([]);
    this.taskForm.reset(
      {
        title: '',
        assignee: null,
        deadline: null,
        priority: null,
        story_points: null,
      },
      { emitEvent: false },
    );
  }

  protected cancelTaskForm(): void {
    this.activeTaskGroupId.set(null);
    this.createTaskError.set(null);
    this.taskForm.reset({ title: '' }, { emitEvent: false });
    this.activeCreateTaskPopover.set(null);
    this.selectedCreateTagIds.set([]);
    this.taskForm.reset(
      {
        title: '',
        assignee: null,
        deadline: null,
        priority: null,
        story_points: null,
      },
      { emitEvent: false },
    );
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
        assignee: this.taskForm.controls.assignee.value,
        priority: this.taskForm.controls.priority.value,
        tag_ids: this.selectedCreateTagIds(),
        deadline: this.taskForm.controls.deadline.value,
        story_points: this.normalizeStoryPoints(
          this.taskForm.controls.story_points.value,
        ),
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

  protected toggleCreateTaskPopover(type: TaskPopoverType, event: Event): void {
    event.stopPropagation();

    this.activeCreateTaskPopover.update((current) =>
      current === type ? null : type,
    );
  }

  protected setCreateAssignee(userId: number | null): void {
    this.taskForm.controls.assignee.setValue(userId);
    this.activeCreateTaskPopover.set(null);
  }

  protected setCreateDeadline(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.taskForm.controls.deadline.setValue(input.value || null);
    this.activeCreateTaskPopover.set(null);
  }

  protected clearCreateDeadline(): void {
    this.taskForm.controls.deadline.setValue(null);
    this.activeCreateTaskPopover.set(null);
  }

  protected setCreatePriority(priority: TaskPriority | null): void {
    this.taskForm.controls.priority.setValue(priority);
    this.activeCreateTaskPopover.set(null);
  }

  protected setCreateStoryPoints(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.taskForm.controls.story_points.setValue(
      this.normalizeStoryPoints(input.valueAsNumber),
    );
  }

  protected clearCreateStoryPoints(): void {
    this.taskForm.controls.story_points.setValue(null);
    this.activeCreateTaskPopover.set(null);
  }

  protected toggleCreateTag(tag: TaskTag): void {
    this.selectedCreateTagIds.update((ids) =>
      ids.includes(tag.id)
        ? ids.filter((id) => id !== tag.id)
        : [...ids, tag.id],
    );
  }

  protected hasCreateTag(tagId: number): boolean {
    return this.selectedCreateTagIds().includes(tagId);
  }

  protected getSelectedCreateTags(): TaskTag[] {
    const ids = this.selectedCreateTagIds();
    return this.taskTags().filter((tag) => ids.includes(tag.id));
  }

  protected openGroupForm(): void {
    this.activeGroupForm.set(true);
    this.activeGroupOptionsId.set(null);
    this.activeTaskPopover.set(null);
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
    this.activeTaskPopover.set(null);
    this.activeGroupOptionsId.update((current) =>
      current === groupId ? null : groupId,
    );
  }

  protected setTaskPriority(
    task: TaskItem,
    priority: TaskPriority | null,
  ): void {
    this.tasksService
      .updateTask(task.id, { priority })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updatedTask) => {
          this.replaceTask(updatedTask);
          this.activeTaskPopover.set(null);
        },
        error: () => this.loadBoard(),
      });
  }

  protected formatPriority(priority: TaskPriority | null): string {
    if (!priority) {
      return 'Priority';
    }

    return this.priorityOptions.find((item) => item.value === priority)?.label ?? 'Priority';
  }

  protected getPriorityIcon(priority: TaskPriority | null): string {
    if (!priority) {
      return '⚑';
    }

    return this.priorityOptions.find((item) => item.value === priority)?.icon ?? '⚑';
  }

  protected shouldShowStoryPoints(task: TaskItem): boolean {
    return this.normalizeStoryPoints(task.story_points) > 0;
  }

  protected setTaskStoryPoints(task: TaskItem, event: Event): void {
    const input = event.target as HTMLInputElement;
    const storyPoints = this.normalizeStoryPoints(input.valueAsNumber);

    this.tasksService
      .updateTask(task.id, { story_points: storyPoints })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updatedTask) => this.replaceTask(updatedTask),
        error: () => this.loadBoard(),
      });
  }

  protected clearTaskStoryPoints(task: TaskItem): void {
    this.tasksService
      .updateTask(task.id, { story_points: 0 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updatedTask) => {
          this.replaceTask(updatedTask);
          this.activeTaskPopover.set(null);
        },
        error: () => this.loadBoard(),
      });
  }

  protected startGroupRename(group: TaskGroup): void {
    this.activeGroupOptionsId.set(null);
    this.renamingGroupId.set(group.id);
    this.renameGroupError.set(null);
    this.selectedRenameColor.set(group.color || '#64748b');

    this.renameGroupForm.reset(
      { name: group.name },
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

  protected isTaskPopoverOpen(task: TaskItem, type: TaskPopoverType): boolean {
    const active = this.activeTaskPopover();

    return active?.taskId === task.id && active.type === type;
  }

  protected toggleTaskPopover(
    task: TaskItem,
    type: TaskPopoverType,
    event: Event,
  ): void {
    event.stopPropagation();

    const active = this.activeTaskPopover();

    if (active?.taskId === task.id && active.type === type) {
      this.activeTaskPopover.set(null);
      return;
    }

    this.activeTaskPopover.set({ taskId: task.id, type });
    this.activeGroupOptionsId.set(null);
    this.tagForm.reset({ name: '' }, { emitEvent: false });
  }

  protected setTaskAssignee(task: TaskItem, userId: number | null): void {
    this.tasksService
      .updateTask(task.id, { assignee: userId })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updatedTask) => {
          this.replaceTask(updatedTask);
          this.activeTaskPopover.set(null);
        },
        error: () => this.loadBoard(),
      });
  }

  protected setTaskDeadline(task: TaskItem, event: Event): void {
    const input = event.target as HTMLInputElement;
    const deadline = input.value || null;

    this.tasksService
      .updateTask(task.id, { deadline })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updatedTask) => {
          this.replaceTask(updatedTask);
          this.activeTaskPopover.set(null);
        },
        error: () => this.loadBoard(),
      });
  }

  protected clearTaskDeadline(task: TaskItem): void {
    this.tasksService
      .updateTask(task.id, { deadline: null })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updatedTask) => {
          this.replaceTask(updatedTask);
          this.activeTaskPopover.set(null);
        },
        error: () => this.loadBoard(),
      });
  }

  protected toggleTaskTag(task: TaskItem, tag: TaskTag): void {
    const currentIds = task.tags.map((item) => item.id);
    const nextIds = currentIds.includes(tag.id)
      ? currentIds.filter((id) => id !== tag.id)
      : [...currentIds, tag.id];

    this.tasksService
      .updateTask(task.id, { tag_ids: nextIds })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updatedTask) => this.replaceTask(updatedTask),
        error: () => this.loadBoard(),
      });
  }

  protected createAndAttachTag(task: TaskItem): void {
    const name = this.tagForm.controls.name.value.trim();

    if (!name) {
      return;
    }

    const existingTag = this.taskTags().find(
      (tag) => tag.name.toLowerCase() === name.toLowerCase(),
    );

    if (existingTag) {
      this.toggleTaskTag(task, existingTag);
      this.tagForm.reset({ name: '' }, { emitEvent: false });
      return;
    }

    this.tasksService
      .createTag(this.projectId, {
        name,
        color: '#64748b',
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (tag) => {
          this.taskTags.update((tags) => [...tags, tag]);

          this.tasksService
            .updateTask(task.id, {
              tag_ids: [...task.tags.map((item) => item.id), tag.id],
            })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: (updatedTask) => {
                this.replaceTask(updatedTask);
                this.tagForm.reset({ name: '' }, { emitEvent: false });
              },
              error: () => this.loadBoard(),
            });
        },
        error: () => this.loadBoard(),
      });
  }

  protected hasTaskTag(task: TaskItem, tagId: number): boolean {
    return task.tags.some((tag) => tag.id === tagId);
  }

  protected toggleTaskCompleted(task: TaskItem): void {
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
        next: (updatedTask) => this.replaceTask(updatedTask),
        error: () => this.loadBoard(),
      });
  }

  protected formatDeadline(deadline: string | null): string {
    if (!deadline) {
      return 'Deadline';
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
    });
  }

  protected buildUserInitials(email: string | null): string {
    if (!email) {
      return '—';
    }

    return email.slice(0, 2).toUpperCase();
  }

  protected reload(): void {
    this.loadBoard();
  }

  private loadProject(): void {
    this.projectsService
      .getProjectById(this.projectId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (project) => this.project.set(project),
        error: () => this.project.set(null),
      });
  }

  private loadBoard(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    forkJoin({
      groups: this.tasksService.getProjectGroups(this.projectId),
      tasks: this.tasksService.getProjectTasks(this.projectId),
      tags: this.tasksService.getProjectTags(this.projectId),
      members: this.projectsService.getProjectMembers(this.projectId),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ groups, tasks, tags, members }) => {
          this.groups.set(groups);
          this.tasks.set(tasks);
          this.taskTags.set(tags);
          this.projectMembers.set(members);
          this.isLoading.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.groups.set([]);
          this.tasks.set([]);
          this.taskTags.set([]);
          this.projectMembers.set([]);
          this.errorMessage.set(this.parseError(error, 'Could not load tasks.'));
          this.isLoading.set(false);
        },
      });
  }

  private normalizeStoryPoints(value: number | null | undefined): number {
    const normalized = Number(value);

    if (!Number.isFinite(normalized) || normalized <= 0) {
      return 0;
    }

    return Math.floor(normalized);
  }

  private replaceTask(updatedTask: TaskItem): void {
    this.tasks.update((tasks) =>
      tasks.map((task) => (task.id === updatedTask.id ? updatedTask : task)),
    );
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

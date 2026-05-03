import { NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormsModule,
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { ProjectMembership } from '../../../core/services/projects.service';
import {
  TaskDetailItem,
  TaskItem,
  TaskPriority,
  TaskTag,
  TasksService,
  UpdateTaskPayload,
} from '../../../core/services/tasks.service';

type ModalTaskItem = TaskItem & {
  subtasks?: ModalTaskItem[];
};

@Component({
  selector: 'app-task-modal',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    FormsModule,
    NgTemplateOutlet,
    ConfirmDialogComponent,
  ],
  templateUrl: './task-modal.component.html',
  styleUrl: './task-modal.component.css',
})
export class TaskModalComponent implements OnChanges {
  @Input({ required: true }) taskId!: number;
  @Input() projectMembers: ProjectMembership[] = [];
  @Input() taskTags: TaskTag[] = [];

  @Output() closed = new EventEmitter<void>();
  @Output() taskUpdated = new EventEmitter<TaskItem>();
  @Output() taskDeleted = new EventEmitter<number>();
  @Output() tagCreated = new EventEmitter<TaskTag>();

  private readonly tasksService = inject(TasksService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);

  protected readonly task = signal<TaskDetailItem | null>(null);
  protected readonly currentTaskId = signal<number | null>(null);
  protected readonly previousTaskIds = signal<number[]>([]);

  protected readonly isLoading = signal(true);
  protected readonly isSaving = signal(false);
  protected readonly isCreatingSubtask = signal(false);
  protected readonly isDeleting = signal(false);
  protected readonly isDeleteConfirmOpen = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly localTaskTags = signal<TaskTag[]>([]);

  protected readonly collapsedSubtaskIds = signal<Set<number>>(new Set<number>());

  protected readonly priorityOptions = [
    { value: 'urgent', label: 'Urgent', icon: '🚩' },
    { value: 'high', label: 'High', icon: '🟧' },
    { value: 'normal', label: 'Normal', icon: '🟦' },
    { value: 'low', label: 'Low', icon: '⬜' },
  ] as const;

  protected readonly taskForm = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(255)]],
    description: [''],
    assignee: this.fb.control<number | null>(null),
    priority: this.fb.control<TaskPriority | null>(null),
    start_date: this.fb.control<string | null>(null),
    deadline: this.fb.control<string | null>(null),
    story_points: this.fb.control<number | null>(null),
    is_completed: [false],
  });

  protected readonly subtaskForm = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(255)]],
  });

  protected readonly taskTagForm = this.fb.nonNullable.group({
    name: [''],
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['taskTags']) {
      this.localTaskTags.set([...this.taskTags]);
    }

    if (changes['taskId'] && this.taskId) {
      this.currentTaskId.set(this.taskId);
      this.previousTaskIds.set([]);
      this.collapsedSubtaskIds.set(new Set<number>());
      this.loadTaskById(this.taskId);
    }
  }

  @HostListener('document:keydown.escape')
  protected handleEscape(): void {
    this.close();
  }

  protected close(): void {
    this.closed.emit();
  }

  protected loadTask(): void {
    const taskId = this.currentTaskId() ?? this.taskId;
    this.loadTaskById(taskId);
  }

  protected openSubtask(subtask: TaskItem): void {
    const current = this.task();

    if (!current) {
      return;
    }

    this.previousTaskIds.update((ids) => [...ids, current.id]);
    this.loadTaskById(subtask.id);
  }

  protected goBackToPreviousTask(): void {
    const history = this.previousTaskIds();

    if (!history.length) {
      return;
    }

    const previousTaskId = history[history.length - 1];

    this.previousTaskIds.set(history.slice(0, -1));
    this.loadTaskById(previousTaskId);
  }

  protected canGoBack(): boolean {
    return this.previousTaskIds().length > 0;
  }

  protected getSubtasks(
    task: TaskItem | TaskDetailItem | ModalTaskItem,
  ): ModalTaskItem[] {
    return ((task as ModalTaskItem).subtasks ?? []) as ModalTaskItem[];
  }

  protected hasNestedSubtasks(
    task: TaskItem | TaskDetailItem | ModalTaskItem,
  ): boolean {
    return this.getSubtasks(task).length > 0;
  }

  protected isSubtaskCollapsed(subtask: TaskItem | ModalTaskItem): boolean {
    return this.collapsedSubtaskIds().has(subtask.id);
  }

  protected openDeleteConfirm(): void {
    this.isDeleteConfirmOpen.set(true);
  }

  protected closeDeleteConfirm(): void {
    if (this.isDeleting()) {
      return;
    }

    this.isDeleteConfirmOpen.set(false);
  }

  protected toggleSubtaskCollapsed(
    subtask: TaskItem | ModalTaskItem,
    event: Event,
  ): void {
    event.stopPropagation();

    if (!this.hasNestedSubtasks(subtask)) {
      return;
    }

    this.collapsedSubtaskIds.update((ids) => {
      const next = new Set(ids);

      if (next.has(subtask.id)) {
        next.delete(subtask.id);
      } else {
        next.add(subtask.id);
      }

      return next;
    });
  }

  protected saveTitle(): void {
    const current = this.task();

    if (!current) {
      return;
    }

    const title = this.taskForm.controls.title.value.trim();

    if (!title) {
      this.taskForm.controls.title.setErrors({ required: true });
      return;
    }

    if (title === current.title) {
      return;
    }

    this.updateCurrentTask({ title });
  }

  protected saveDescription(): void {
    const current = this.task();

    if (!current) {
      return;
    }

    const description = this.taskForm.controls.description.value.trim();

    if (description === (current.description || '')) {
      return;
    }

    this.updateCurrentTask({ description });
  }

  protected getSelectedAssignee(task: TaskItem | TaskDetailItem): number | null {
    return task.assignee ?? null;
  }

  protected setAssigneeValue(value: number | null): void {
    this.updateCurrentTask({ assignee: value });
  }

  protected setSubtaskAssigneeValue(
    subtask: TaskItem,
    value: number | null,
  ): void {
    this.updateSubtask(subtask, { assignee: value });
  }

  protected getActiveStoryPoints(task: TaskDetailItem): number {
    return this.normalizeStoryPoints(task.active_story_points);
  }

  protected setCompleted(): void {
    const current = this.task();

    if (!current) {
      return;
    }

    this.updateCurrentTask({
      is_completed: !current.is_completed,
    });
  }

  protected setPriority(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const priority = select.value ? (select.value as TaskPriority) : null;

    this.updateCurrentTask({ priority });
  }

  protected setStartDate(event: Event): void {
    const input = event.target as HTMLInputElement;

    this.updateCurrentTask({
      start_date: input.value || null,
    });
  }

  protected clearStartDate(): void {
    this.updateCurrentTask({ start_date: null });
  }

  protected setDeadline(event: Event): void {
    const input = event.target as HTMLInputElement;

    this.updateCurrentTask({
      deadline: input.value || null,
    });
  }

  protected clearDeadline(): void {
    this.updateCurrentTask({ deadline: null });
  }

  protected setSubtaskStartDate(subtask: TaskItem, event: Event): void {
    const input = event.target as HTMLInputElement;

    this.updateSubtask(subtask, {
      start_date: input.value || null,
    });
  }

  protected setStoryPoints(event: Event): void {
    const input = event.target as HTMLInputElement;

    this.updateCurrentTask({
      story_points: this.normalizeStoryPoints(input.valueAsNumber),
    });
  }

  protected clearStoryPoints(): void {
    this.updateCurrentTask({ story_points: 0 });
  }

  protected deleteTask(): void {
    const current = this.task();

    if (!current) {
      return;
    }

    const deletedTaskId = current.id;

    this.isDeleting.set(true);
    this.errorMessage.set(null);

    this.tasksService
      .deleteTask(deletedTaskId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.taskDeleted.emit(deletedTaskId);

          this.isDeleting.set(false);
          this.isDeleteConfirmOpen.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.errorMessage.set(
            this.parseError(error, 'Could not delete task.'),
          );
          this.isDeleting.set(false);
        },
      });
  }

  protected toggleTag(tag: TaskTag): void {
    const current = this.task();

    if (!current) {
      return;
    }

    const currentIds = current.tags.map((item) => item.id);
    const nextIds = currentIds.includes(tag.id)
      ? currentIds.filter((id) => id !== tag.id)
      : [...currentIds, tag.id];

    this.updateCurrentTask({ tag_ids: nextIds });
  }

  protected hasTag(tagId: number): boolean {
    return this.task()?.tags.some((tag) => tag.id === tagId) ?? false;
  }

  protected createAndAttachTagToTask(): void {
    const current = this.task();

    if (!current) {
      return;
    }

    const name = this.taskTagForm.controls.name.value.trim();

    if (!name) {
      return;
    }

    const existingTag = this.findExistingTag(name);

    if (existingTag) {
      this.attachTagToTask(existingTag);
      this.taskTagForm.reset({ name: '' }, { emitEvent: false });
      return;
    }

    this.tasksService
      .createTag(current.project, {
        name,
        color: '#64748b',
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (tag) => {
          this.localTaskTags.update((tags) => [...tags, tag]);
          this.tagCreated.emit(tag);
          this.attachTagToTask(tag);
          this.taskTagForm.reset({ name: '' }, { emitEvent: false });
        },
        error: (error: HttpErrorResponse) => {
          this.errorMessage.set(this.parseError(error, 'Could not create tag.'));
        },
      });
  }

  protected createSubtask(): void {
    const current = this.task();

    if (!current || this.subtaskForm.invalid) {
      this.subtaskForm.markAllAsTouched();
      return;
    }

    const title = this.subtaskForm.controls.title.value.trim();

    if (!title) {
      this.subtaskForm.controls.title.setErrors({ required: true });
      return;
    }

    this.isCreatingSubtask.set(true);

    this.tasksService
      .createSubtask(current.id, {
        title,
        description: '',
        assignee: null,
        priority: null,
        story_points: 0,
        start_date: null,
        deadline: null,
        position: this.getSubtasks(current).length,
        is_completed: false,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.subtaskForm.reset({ title: '' }, { emitEvent: false });
          this.isCreatingSubtask.set(false);
          this.reloadTaskAndEmit();
        },
        error: (error: HttpErrorResponse) => {
          this.errorMessage.set(
            this.parseError(error, 'Could not create subtask.'),
          );
          this.isCreatingSubtask.set(false);
        },
      });
  }

  protected toggleSubtaskCompleted(subtask: TaskItem): void {
    this.updateSubtask(subtask, {
      is_completed: !subtask.is_completed,
    });
  }

  protected saveSubtaskTitle(subtask: TaskItem, event: Event): void {
    const input = event.target as HTMLInputElement;
    const title = input.value.trim();

    if (!title || title === subtask.title) {
      input.value = subtask.title;
      return;
    }

    this.updateSubtask(subtask, { title });
  }

  protected setSubtaskPriority(subtask: TaskItem, event: Event): void {
    const select = event.target as HTMLSelectElement;

    this.updateSubtask(subtask, {
      priority: select.value ? (select.value as TaskPriority) : null,
    });
  }

  protected setSubtaskDeadline(subtask: TaskItem, event: Event): void {
    const input = event.target as HTMLInputElement;

    this.updateSubtask(subtask, {
      deadline: input.value || null,
    });
  }

  protected setSubtaskStoryPoints(subtask: TaskItem, event: Event): void {
    const input = event.target as HTMLInputElement;

    this.updateSubtask(subtask, {
      story_points: this.normalizeStoryPoints(input.valueAsNumber),
    });
  }

  protected shouldShowStoryPoints(task: TaskItem): boolean {
    return this.normalizeStoryPoints(task.story_points) > 0;
  }

  private loadTaskById(taskId: number): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.currentTaskId.set(taskId);

    this.tasksService
      .getTask(taskId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (task) => {
          this.task.set(task);
          this.patchForm(task);
          this.isLoading.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.errorMessage.set(this.parseError(error, 'Could not load task.'));
          this.isLoading.set(false);
        },
      });
  }

  private findExistingTag(name: string): TaskTag | undefined {
    return this.localTaskTags().find(
      (tag) => tag.name.toLowerCase() === name.toLowerCase(),
    );
  }

  private attachTagToTask(tag: TaskTag): void {
    const current = this.task();

    if (!current) {
      return;
    }

    const currentIds = current.tags.map((item) => item.id);

    if (currentIds.includes(tag.id)) {
      return;
    }

    this.updateCurrentTask({
      tag_ids: [...currentIds, tag.id],
    });
  }

  private updateCurrentTask(payload: UpdateTaskPayload): void {
    const current = this.task();

    if (!current) {
      return;
    }

    this.isSaving.set(true);

    this.tasksService
      .updateTask(current.id, payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updatedTask) => {
          this.task.set(updatedTask);
          this.patchForm(updatedTask);
          this.emitBoardRelevantTask(updatedTask);
          this.isSaving.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.errorMessage.set(
            this.parseError(error, 'Could not update task.'),
          );
          this.isSaving.set(false);
          this.loadTask();
        },
      });
  }

  private updateSubtask(subtask: TaskItem, payload: UpdateTaskPayload): void {
    this.tasksService
      .updateTask(subtask.id, payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.reloadTaskAndEmit(),
        error: (error: HttpErrorResponse) => {
          this.errorMessage.set(
            this.parseError(error, 'Could not update subtask.'),
          );
          this.loadTask();
        },
      });
  }

  private reloadTaskAndEmit(): void {
    const currentId = this.currentTaskId() ?? this.taskId;

    this.tasksService
      .getTask(currentId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (task) => {
          this.task.set(task);
          this.patchForm(task);
          this.emitBoardRelevantTask(task);
        },
        error: (error: HttpErrorResponse) => {
          this.errorMessage.set(
            this.parseError(error, 'Could not reload task.'),
          );
        },
      });
  }

  private emitBoardRelevantTask(task: TaskDetailItem): void {
    if (!task.parent_task) {
      this.taskUpdated.emit(task);
      return;
    }

    this.loadRootTaskAndEmit(task.parent_task);
  }

  private loadRootTaskAndEmit(taskId: number): void {
    this.tasksService
      .getTask(taskId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (parentTask) => {
          if (parentTask.parent_task) {
            this.loadRootTaskAndEmit(parentTask.parent_task);
            return;
          }

          this.taskUpdated.emit(parentTask);
        },
        error: () => {
          const current = this.task();

          if (current) {
            this.taskUpdated.emit(current);
          }
        },
      });
  }

  private patchForm(task: TaskDetailItem): void {
    this.taskForm.reset(
      {
        title: task.title,
        description: task.description || '',
        assignee: task.assignee,
        priority: task.priority,
        start_date: task.start_date,
        deadline: task.deadline,
        story_points: this.normalizeStoryPoints(task.story_points) || null,
        is_completed: task.is_completed,
      },
      { emitEvent: false },
    );
  }

  private normalizeStoryPoints(value: number | null | undefined): number {
    const normalized = Number(value);

    if (!Number.isFinite(normalized) || normalized <= 0) {
      return 0;
    }

    return Math.floor(normalized);
  }

  protected getVisibleSubtaskLevel(level: number): number {
    return Math.min(level, 3);
  }

  private parseError(error: HttpErrorResponse, fallback: string): string {
    if (typeof error.error?.detail === 'string') {
      return error.error.detail;
    }

    if (typeof error.error?.non_field_errors?.[0] === 'string') {
      return error.error.non_field_errors[0];
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

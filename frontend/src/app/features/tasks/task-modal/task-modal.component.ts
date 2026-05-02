import { DOCUMENT } from '@angular/common';
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
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { environment } from '../../../../environments/environment';
import { ProjectMembership } from '../../../core/services/projects.service';
import {
  TaskDetailItem,
  TaskItem,
  TaskPriority,
  TaskTag,
  TasksService,
  UpdateTaskPayload,
} from '../../../core/services/tasks.service';

@Component({
  selector: 'app-task-modal',
  standalone: true,
  imports: [ReactiveFormsModule],
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

  private readonly tasksService = inject(TasksService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);
  private readonly document = inject(DOCUMENT);

  protected readonly task = signal<TaskDetailItem | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly isSaving = signal(false);
  protected readonly isCreatingSubtask = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

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
    deadline: this.fb.control<string | null>(null),
    story_points: this.fb.control<number | null>(null),
    is_completed: [false],
  });

  protected readonly subtaskForm = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(255)]],
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['taskId'] && this.taskId) {
      this.loadTask();
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
    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.tasksService
      .getTask(this.taskId)
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

  protected saveTitle(): void {
    const title = this.taskForm.controls.title.value.trim();

    if (!title) {
      this.taskForm.controls.title.setErrors({ required: true });
      return;
    }

    this.updateCurrentTask({ title });
  }

  protected saveDescription(): void {
    this.updateCurrentTask({
      description: this.taskForm.controls.description.value.trim(),
    });
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

  protected setAssignee(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const assignee = select.value ? Number(select.value) : null;

    this.updateCurrentTask({ assignee });
  }

  protected setPriority(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const priority = select.value ? (select.value as TaskPriority) : null;

    this.updateCurrentTask({ priority });
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

  protected setStoryPoints(event: Event): void {
    const input = event.target as HTMLInputElement;

    this.updateCurrentTask({
      story_points: this.normalizeStoryPoints(input.valueAsNumber),
    });
  }

  protected clearStoryPoints(): void {
    this.updateCurrentTask({ story_points: 0 });
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
        story_points: null,
        deadline: null,
        position: current.subtasks.length,
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
          this.errorMessage.set(this.parseError(error, 'Could not create subtask.'));
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

  protected setSubtaskAssignee(subtask: TaskItem, event: Event): void {
    const select = event.target as HTMLSelectElement;

    this.updateSubtask(subtask, {
      assignee: select.value ? Number(select.value) : null,
    });
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

  protected formatPriority(priority: TaskPriority | null): string {
    if (!priority) {
      return 'No priority';
    }

    return this.priorityOptions.find((item) => item.value === priority)?.label ?? 'No priority';
  }

  protected getPriorityIcon(priority: TaskPriority | null): string {
    if (!priority) {
      return '⚑';
    }

    return this.priorityOptions.find((item) => item.value === priority)?.icon ?? '⚑';
  }

  protected buildUserInitials(email: string | null): string {
    if (!email) {
      return '—';
    }

    return email.slice(0, 2).toUpperCase();
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
          this.taskUpdated.emit(updatedTask);
          this.isSaving.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.errorMessage.set(this.parseError(error, 'Could not update task.'));
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
          this.errorMessage.set(this.parseError(error, 'Could not update subtask.'));
          this.loadTask();
        },
      });
  }

  private reloadTaskAndEmit(): void {
    this.tasksService
      .getTask(this.taskId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (task) => {
          this.task.set(task);
          this.patchForm(task);
          this.taskUpdated.emit(task);
        },
        error: (error: HttpErrorResponse) => {
          this.errorMessage.set(this.parseError(error, 'Could not reload task.'));
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

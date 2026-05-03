import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CdkDragStart, DragDropModule } from '@angular/cdk/drag-drop';

import { environment } from '../../../../environments/environment';
import {
  TaskItem,
  TaskPriority,
} from '../../../core/services/tasks.service';

export type TaskCardPopoverType = 'assignee' | 'deadline' | 'tags' | 'priority' | 'points';

@Component({
  selector: 'app-task-card',
  standalone: true,
  imports: [DragDropModule],
  templateUrl: './task-card.component.html',
  styleUrl: './task-card.component.css',
})
export class TaskCardComponent {
  @Input({ required: true }) task!: TaskItem;
  @Input() activePopoverType: TaskCardPopoverType | null = null;

  @Output() opened = new EventEmitter<TaskItem>();
  @Output() completedToggled = new EventEmitter<TaskItem>();
  @Output() popoverRequested = new EventEmitter<{
    task: TaskItem;
    type: TaskCardPopoverType;
    event: Event;
  }>();
  @Output() dragStarted = new EventEmitter<CdkDragStart>();
  @Output() dragEnded = new EventEmitter<void>();

  protected readonly priorityOptions = [
    { value: 'urgent', label: 'Urgent', icon: '🚩' },
    { value: 'high', label: 'High', icon: '🟧' },
    { value: 'normal', label: 'Normal', icon: '🟦' },
    { value: 'low', label: 'Low', icon: '⬜' },
  ] as const;

  protected openCard(): void {
    this.opened.emit(this.task);
  }

  protected toggleCompleted(event: Event): void {
    event.stopPropagation();
    this.completedToggled.emit(this.task);
  }

  protected requestPopover(type: TaskCardPopoverType, event: Event): void {
    event.stopPropagation();
    this.popoverRequested.emit({ task: this.task, type, event });
  }

  protected isPopoverActive(type: TaskCardPopoverType): boolean {
    return this.activePopoverType === type;
  }

  protected shouldShowStoryPoints(task: TaskItem): boolean {
    return this.normalizeStoryPoints(task.active_story_points) > 0;
  }

  protected getActiveStoryPoints(task: TaskItem): number {
    return this.normalizeStoryPoints(task.active_story_points);
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

  protected buildUserInitials(email: string | null): string {
    if (!email) {
      return '—';
    }

    return email.slice(0, 2).toUpperCase();
  }

  private normalizeStoryPoints(value: number | null | undefined): number {
    const normalized = Number(value);

    if (!Number.isFinite(normalized) || normalized <= 0) {
      return 0;
    }

    return Math.floor(normalized);
  }
}

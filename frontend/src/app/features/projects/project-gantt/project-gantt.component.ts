import {
  Component,
  DestroyRef,
  Input,
  OnChanges,
  SimpleChanges,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';

import {
  ProjectListItem,
  ProjectsService,
} from '../../../core/services/projects.service';
import {
  ProjectMetricTask,
  ProjectMetrics,
  TasksService,
} from '../../../core/services/tasks.service';

interface GanttDay {
  date: string;
  day: string;
  weekday: string;
  isToday: boolean;
  isWeekend: boolean;
}

@Component({
  selector: 'app-project-gantt',
  standalone: true,
  templateUrl: './project-gantt.component.html',
  styleUrl: './project-gantt.component.css',
})
export class ProjectGanttComponent implements OnChanges {
  @Input({ required: true }) projectId!: number;

  private readonly destroyRef = inject(DestroyRef);
  private readonly tasksService = inject(TasksService);
  private readonly projectsService = inject(ProjectsService);

  private readonly dayWidth = 92;

  protected readonly isLoading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly metrics = signal<ProjectMetrics | null>(null);
  protected readonly project = signal<ProjectListItem | null>(null);

  protected readonly timelineStart = computed(() => {
    const dates = this.collectTimelineDates();

    if (!dates.length) {
      return this.startOfDay(new Date());
    }

    dates.sort((a, b) => a.getTime() - b.getTime());

    const start = new Date(dates[0]);
    start.setDate(start.getDate() - 2);

    return this.startOfDay(start);
  });

  protected readonly timelineEnd = computed(() => {
    const dates = this.collectTimelineDates();

    if (!dates.length) {
      const end = new Date();
      end.setDate(end.getDate() + 14);

      return this.startOfDay(end);
    }

    dates.sort((a, b) => a.getTime() - b.getTime());

    const end = new Date(dates[dates.length - 1]);
    end.setDate(end.getDate() + 3);

    return this.startOfDay(end);
  });

  protected readonly timelineDays = computed<GanttDay[]>(() => {
    const start = this.timelineStart();
    const end = this.timelineEnd();
    const days: GanttDay[] = [];

    const current = new Date(start);

    while (current.getTime() <= end.getTime()) {
      const date = this.toDateInputValue(current);
      const weekdayIndex = current.getDay();

      days.push({
        date,
        day: current.toLocaleDateString(undefined, { day: '2-digit' }),
        weekday: current.toLocaleDateString(undefined, { weekday: 'short' }),
        isToday: this.isSameDate(current, new Date()),
        isWeekend: weekdayIndex === 0 || weekdayIndex === 6,
      });

      current.setDate(current.getDate() + 1);
    }

    return days;
  });

  protected readonly timelineWidth = computed(() => {
    return Math.max(1, this.timelineDays().length) * this.dayWidth;
  });

  protected readonly ganttTasks = computed(() => {
    const tasks = [...(this.metrics()?.gantt.tasks ?? [])];

    return tasks.sort((a, b) => {
      const aStart = a.start_date || a.deadline || '';
      const bStart = b.start_date || b.deadline || '';

      return (
        aStart.localeCompare(bStart) ||
        this.getTaskDepth(a) - this.getTaskDepth(b) ||
        a.id - b.id
      );
    });
  });

  protected readonly projectDurationLabel = computed(() => {
    const project = this.project();

    if (project?.start_date && project?.end_date) {
      return `${this.formatDate(project.start_date)} → ${this.formatDate(project.end_date)}`;
    }

    return `${this.formatDateFromDate(this.timelineStart())} → ${this.formatDateFromDate(this.timelineEnd())}`;
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['projectId'] && this.projectId) {
      this.loadGantt();
    }
  }

  protected reload(): void {
    this.loadGantt();
  }

  protected getTaskDepth(task: ProjectMetricTask): number {
    let depth = 0;
    let parentId = task.parent_task;
    const allTasks = this.metrics()?.gantt.tasks ?? [];
    const visited = new Set<number>();

    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);

      const parent = allTasks.find((item) => item.id === parentId);

      if (!parent) {
        break;
      }

      depth += 1;
      parentId = parent.parent_task;
    }

    return Math.min(depth, 4);
  }

  protected getTaskTypeLabel(task: ProjectMetricTask): string {
    return task.parent_task ? 'Subtask' : 'Task';
  }

  protected getTaskDateRange(task: ProjectMetricTask): string {
    const start = task.start_date ? this.formatDate(task.start_date) : 'No start';
    const end = task.deadline ? this.formatDate(task.deadline) : 'No deadline';

    return `${start} → ${end}`;
  }

  protected getTaskLeft(task: ProjectMetricTask): number {
    const startDate = this.parseDate(task.start_date || task.deadline);

    if (!startDate) {
      return 0;
    }

    const offsetDays = this.daysBetween(this.timelineStart(), startDate);

    return Math.max(0, offsetDays * this.dayWidth);
  }

  protected getTaskWidth(task: ProjectMetricTask): number {
    const start = this.parseDate(task.start_date || task.deadline);
    const end = this.parseDate(task.deadline || task.start_date);

    if (!start || !end) {
      return this.dayWidth;
    }

    const durationDays = Math.max(1, this.daysBetween(start, end) + 1);

    return Math.max(this.dayWidth * 0.72, durationDays * this.dayWidth);
  }

  protected getTodayLeft(): number | null {
    const today = this.startOfDay(new Date());
    const start = this.timelineStart();
    const end = this.timelineEnd();

    if (today.getTime() < start.getTime() || today.getTime() > end.getTime()) {
      return null;
    }

    return this.daysBetween(start, today) * this.dayWidth + this.dayWidth / 2;
  }

  protected isTaskOverdue(task: ProjectMetricTask): boolean {
    if (!task.deadline || task.is_completed) {
      return false;
    }

    const deadline = this.parseDate(task.deadline);

    if (!deadline) {
      return false;
    }

    return deadline.getTime() < this.startOfDay(new Date()).getTime();
  }

  protected formatDate(date: string | null): string {
    if (!date) {
      return 'No date';
    }

    return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  }

  protected formatDateFromDate(date: Date): string {
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  }

  protected getCompletedTasksCount(): number {
    return this.ganttTasks().filter((task) => task.is_completed).length;
  }

  protected getOpenTasksCount(): number {
    return this.ganttTasks().filter((task) => !task.is_completed).length;
  }

  protected getOverdueTasksCount(): number {
    return this.ganttTasks().filter((task) => this.isTaskOverdue(task)).length;
  }

  private loadGantt(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    forkJoin({
      metrics: this.tasksService.getProjectMetrics(this.projectId),
      project: this.projectsService.getProjectById(this.projectId),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ metrics, project }) => {
          this.metrics.set(metrics);
          this.project.set(project);
          this.isLoading.set(false);
        },
        error: () => {
          this.metrics.set(null);
          this.project.set(null);
          this.errorMessage.set('Could not load Gantt timeline.');
          this.isLoading.set(false);
        },
      });
  }

  private collectTimelineDates(): Date[] {
    const dates: Date[] = [];
    const project = this.project();
    const tasks = this.metrics()?.gantt.tasks ?? [];

    if (project?.start_date) {
      const date = this.parseDate(project.start_date);

      if (date) {
        dates.push(date);
      }
    }

    if (project?.end_date) {
      const date = this.parseDate(project.end_date);

      if (date) {
        dates.push(date);
      }
    }

    for (const task of tasks) {
      const start = this.parseDate(task.start_date);
      const end = this.parseDate(task.deadline);

      if (start) {
        dates.push(start);
      }

      if (end) {
        dates.push(end);
      }
    }

    return dates;
  }

  private parseDate(value: string | null | undefined): Date | null {
    if (!value) {
      return null;
    }

    const date = new Date(`${value}T00:00:00`);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return this.startOfDay(date);
  }

  private startOfDay(date: Date): Date {
    const copy = new Date(date);

    copy.setHours(0, 0, 0, 0);

    return copy;
  }

  private toDateInputValue(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  private isSameDate(first: Date, second: Date): boolean {
    return (
      first.getFullYear() === second.getFullYear() &&
      first.getMonth() === second.getMonth() &&
      first.getDate() === second.getDate()
    );
  }

  private daysBetween(start: Date, end: Date): number {
    const msPerDay = 1000 * 60 * 60 * 24;

    const startTime = Date.UTC(
      start.getFullYear(),
      start.getMonth(),
      start.getDate(),
    );

    const endTime = Date.UTC(
      end.getFullYear(),
      end.getMonth(),
      end.getDate(),
    );

    return Math.round((endTime - startTime) / msPerDay);
  }
}

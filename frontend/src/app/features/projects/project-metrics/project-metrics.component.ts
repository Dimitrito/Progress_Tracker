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

interface ScheduleRange {
  start: Date;
  end: Date;
  totalDays: number;
}

@Component({
  selector: 'app-project-metrics',
  standalone: true,
  templateUrl: './project-metrics.component.html',
  styleUrl: './project-metrics.component.css',
})
export class ProjectMetricsComponent implements OnChanges {
  @Input({ required: true }) projectId!: number;

  private readonly destroyRef = inject(DestroyRef);
  private readonly tasksService = inject(TasksService);
  private readonly projectsService = inject(ProjectsService);

  protected readonly isLoading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly metrics = signal<ProjectMetrics | null>(null);
  protected readonly project = signal<ProjectListItem | null>(null);

  protected readonly scheduleRange = computed<ScheduleRange | null>(() => {
    const project = this.project();
    const metrics = this.metrics();

    const dates: Date[] = [];

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

    for (const task of metrics?.gantt.tasks ?? []) {
      const start = this.parseDate(task.start_date);
      const end = this.parseDate(task.deadline);

      if (start) {
        dates.push(start);
      }

      if (end) {
        dates.push(end);
      }
    }

    if (!dates.length) {
      const today = new Date();
      const fallbackEnd = new Date();

      fallbackEnd.setDate(today.getDate() + 30);

      return {
        start: today,
        end: fallbackEnd,
        totalDays: this.daysBetween(today, fallbackEnd),
      };
    }

    const sorted = dates.sort((a, b) => a.getTime() - b.getTime());
    const start = sorted[0];
    const end = sorted[sorted.length - 1];

    return {
      start,
      end,
      totalDays: Math.max(1, this.daysBetween(start, end)),
    };
  });

  protected readonly statusMaxTasks = computed(() => {
    const values = this.metrics()?.status_distribution.map((item) => item.tasks_count) ?? [];

    return Math.max(1, ...values);
  });

  protected readonly velocityMaxValue = computed(() => {
    const velocity = this.metrics()?.velocity;

    if (!velocity) {
      return 1;
    }

    return Math.max(
      1,
      velocity.completed_points_last_7_days,
      velocity.completed_points_last_30_days,
      velocity.completed_tasks_last_7_days,
      velocity.completed_tasks_last_30_days,
    );
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['projectId'] && this.projectId) {
      this.loadMetrics();
    }
  }

  protected reload(): void {
    this.loadMetrics();
  }

  protected getHealthClass(status: string): string {
    const normalized = status.toLowerCase();

    if (normalized === 'good') {
      return 'health-good';
    }

    if (normalized === 'risky') {
      return 'health-risky';
    }

    return 'health-critical';
  }

  protected getHealthColor(status: string): string {
    const normalized = status.toLowerCase();

    if (normalized === 'good') {
      return 'var(--success)';
    }

    if (normalized === 'risky') {
      return '#f59e0b';
    }

    return 'var(--danger)';
  }

  protected getPercent(value: number | null | undefined): number {
    const normalized = Number(value);

    if (!Number.isFinite(normalized)) {
      return 0;
    }

    return Math.max(0, Math.min(100, Math.round(normalized)));
  }

  protected getRingStyle(percent: number, color = 'var(--primary)'): Record<string, string> {
    return {
      '--ring-percent': `${this.getPercent(percent)}%`,
      '--ring-color': color,
    };
  }

  protected getStatusTaskWidth(tasksCount: number): number {
    return Math.max(4, this.getPercent((tasksCount / this.statusMaxTasks()) * 100));
  }

  protected getStatusCompletedPercent(item: {
    completed_tasks_count: number;
    tasks_count: number;
  }): number {
    if (!item.tasks_count) {
      return 0;
    }

    return this.getPercent((item.completed_tasks_count / item.tasks_count) * 100);
  }

  protected getVelocityBarWidth(value: number): number {
    return Math.max(4, this.getPercent((value / this.velocityMaxValue()) * 100));
  }

  protected formatDate(date: string | null): string {
    if (!date) {
      return 'No date';
    }

    return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  protected formatDateFromObject(date: Date): string {
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  protected getPriorityTaskList(tasks: ProjectMetricTask[]): ProjectMetricTask[] {
    return tasks.slice(0, 5);
  }

  protected getTaskLabel(task: ProjectMetricTask): string {
    if (task.parent_task) {
      return 'Subtask';
    }

    return 'Task';
  }

  protected getTodayOffset(): number {
    const range = this.scheduleRange();

    if (!range) {
      return 0;
    }

    const today = new Date();
    const offsetDays = this.daysBetween(range.start, today);

    return this.getPercent((offsetDays / range.totalDays) * 100);
  }

  protected getBurndownIdealLine(): string {
    return '6,8 94,42';
  }

  protected getBurndownActualPoint(): { x: number; y: number } {
    const data = this.metrics();

    if (!data) {
      return { x: 6, y: 42 };
    }

    const x = 6 + (this.getTodayOffset() / 100) * 88;

    const total = data.points_progress.total_points;
    const remaining = data.points_progress.remaining_points;

    if (!total) {
      return { x, y: 42 };
    }

    const remainingRatio = Math.max(0, Math.min(1, remaining / total));
    const y = 42 - remainingRatio * 34;

    return {
      x: Math.max(6, Math.min(94, x)),
      y: Math.max(8, Math.min(42, y)),
    };
  }

  protected getBurnDownAreaPoints(): string {
    const point = this.getBurndownActualPoint();

    return `6,8 ${point.x},${point.y} ${point.x},42 6,42`;
  }

  protected getBurnDownActualLine(): string {
    const point = this.getBurndownActualPoint();

    return `6,8 ${point.x},${point.y}`;
  }

  protected getBurnDownTodayLineX(): number {
    return this.getBurndownActualPoint().x;
  }

  private loadMetrics(): void {
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
          this.errorMessage.set('Could not load project metrics.');
          this.isLoading.set(false);
        },
      });
  }

  private parseDate(value: string | null | undefined): Date | null {
    if (!value) {
      return null;
    }

    const date = new Date(`${value}T00:00:00`);

    return Number.isNaN(date.getTime()) ? null : date;
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

    return Math.max(0, Math.round((endTime - startTime) / msPerDay));
  }
}

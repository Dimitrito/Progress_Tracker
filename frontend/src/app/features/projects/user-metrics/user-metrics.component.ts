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

import { environment } from '../../../../environments/environment';
import {
  ProjectUserMetricItem,
  ProjectUserMetrics,
  TasksService,
} from '../../../core/services/tasks.service';

@Component({
  selector: 'app-user-metrics',
  standalone: true,
  templateUrl: './user-metrics.component.html',
  styleUrl: './user-metrics.component.css',
})
export class UserMetricsComponent implements OnChanges {
  @Input({ required: true }) projectId!: number;

  private readonly destroyRef = inject(DestroyRef);
  private readonly tasksService = inject(TasksService);

  protected readonly isLoading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly metrics = signal<ProjectUserMetrics | null>(null);

  protected readonly maxAssignedTasks = computed(() => {
    const values = this.metrics()?.users.map((user) => user.assigned_tasks_count) ?? [];

    return Math.max(1, ...values);
  });

  protected readonly maxCompletedPoints = computed(() => {
    const values = this.metrics()?.users.map((user) => user.completed_points) ?? [];

    return Math.max(1, ...values);
  });

  protected readonly maxRemainingPoints = computed(() => {
    const values = this.metrics()?.users.map((user) => user.remaining_points) ?? [];

    return Math.max(1, ...values);
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['projectId'] && this.projectId) {
      this.loadMetrics();
    }
  }

  protected reload(): void {
    this.loadMetrics();
  }

  protected getPercent(value: number | null | undefined): number {
    const normalized = Number(value);

    if (!Number.isFinite(normalized)) {
      return 0;
    }

    return Math.max(0, Math.min(100, Math.round(normalized)));
  }

  protected getContributionClass(score: number): string {
    if (score >= 75) {
      return 'score-good';
    }

    if (score >= 45) {
      return 'score-risky';
    }

    return 'score-low';
  }

  protected getAssignedWidth(user: ProjectUserMetricItem): number {
    return Math.max(
      4,
      this.getPercent((user.assigned_tasks_count / this.maxAssignedTasks()) * 100),
    );
  }

  protected getCompletedPointsWidth(user: ProjectUserMetricItem): number {
    return Math.max(
      4,
      this.getPercent((user.completed_points / this.maxCompletedPoints()) * 100),
    );
  }

  protected getRemainingPointsWidth(user: ProjectUserMetricItem): number {
    return Math.max(
      4,
      this.getPercent((user.remaining_points / this.maxRemainingPoints()) * 100),
    );
  }

  protected getInitials(email: string): string {
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

  private loadMetrics(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.tasksService
      .getProjectUserMetrics(this.projectId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (metrics) => {
          this.metrics.set(metrics);
          this.isLoading.set(false);
        },
        error: () => {
          this.metrics.set(null);
          this.errorMessage.set('Could not load user metrics.');
          this.isLoading.set(false);
        },
      });
  }
}

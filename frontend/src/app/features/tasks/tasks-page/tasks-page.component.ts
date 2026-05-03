import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';

import { TaskBoardComponent } from '../task-board/task-board.component';
import { ProjectMetricsComponent } from '../../projects/project-metrics/project-metrics.component';
import { ProjectGanttComponent } from '../../projects/project-gantt/project-gantt.component';
import {
  ProjectListItem,
  ProjectsService,
} from '../../../core/services/projects.service';

type TaskView = 'board' | 'project-metrics' | 'gantt' | 'table' | 'settings';

@Component({
  selector: 'app-tasks-page',
  standalone: true,
  imports: [TaskBoardComponent, ProjectMetricsComponent, ProjectGanttComponent],
  templateUrl: './tasks-page.component.html',
  styleUrl: './tasks-page.component.css',
})
export class TasksPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly projectsService = inject(ProjectsService);

  protected readonly projectId = Number(this.route.snapshot.paramMap.get('id'));
  protected readonly activeView = signal<TaskView>('board');
  protected readonly project = signal<ProjectListItem | null>(null);

  constructor() {
    this.loadProject();
  }

  protected setActiveView(view: TaskView): void {
    this.activeView.set(view);
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
}

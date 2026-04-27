import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

@Component({
  selector: 'app-tasks-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './tasks-page.component.html',
  styleUrl: './tasks-page.component.css',
})
export class TasksPageComponent {
  private readonly route = inject(ActivatedRoute);

  protected readonly projectId = Number(this.route.snapshot.paramMap.get('id'));
}

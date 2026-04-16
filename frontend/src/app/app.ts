import { Component, inject } from '@angular/core';
import { ApiService } from './core/services/api.service';

@Component({
  selector: 'app-root',
  template: `<h1>Project Progress Tracker</h1><p>{{ status }}</p>`
})
export class AppComponent {
  private api = inject(ApiService);
  status = 'loading...';

  ngOnInit() {
    this.api.getHealth().subscribe({
      next: (res) => this.status = res.status,
      error: () => this.status = 'backend unavailable'
    });
  }
}

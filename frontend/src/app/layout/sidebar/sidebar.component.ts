import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

interface SidebarItem {
  label: string;
  route: string | null;
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css',
})
export class SidebarComponent {
  protected readonly items: SidebarItem[] = [
    { label: 'Organizations', route: '/app/organizations' },
    { label: 'Projects', route: '/app/projects' },
    { label: 'Tasks', route: null },
    { label: 'Metrics', route: null },
    { label: 'Profile', route: null },
  ];
}

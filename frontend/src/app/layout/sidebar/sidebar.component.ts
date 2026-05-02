import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink, RouterLinkActive } from '@angular/router';

import {
  OrganizationListItem,
  OrganizationsService,
} from '../../core/services/organizations.service';
import {
  ProjectListItem,
  ProjectsService,
} from '../../core/services/projects.service';
import { OrganizationContextService } from '../../core/services/organization-context.service';

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
  private readonly destroyRef = inject(DestroyRef);
  private readonly organizationsService = inject(OrganizationsService);
  private readonly projectsService = inject(ProjectsService);
  private readonly organizationContext = inject(OrganizationContextService);

  protected readonly selectedOrganization =
    this.organizationContext.selectedOrganization;

  protected readonly organizations = signal<OrganizationListItem[]>([]);
  protected readonly projects = signal<ProjectListItem[]>([]);
  protected readonly invitationsCount = this.organizationsService.invitationsCount;

  protected readonly workspacesOpen = signal(false);
  protected readonly projectsOpen = signal(false);

  protected readonly visibleProjects = computed(() => {
    const selectedOrganization = this.selectedOrganization();

    if (!selectedOrganization) {
      return [];
    }

    return this.projects().filter(
      (project) => project.organization === selectedOrganization.id,
    );
  });

  protected readonly items: SidebarItem[] = [
    { label: 'Profile', route: '/app/profile' },
  ];

  constructor() {
    this.loadOrganizations();
    this.loadInvitationsCount();
    this.loadProjects();
  }

  protected toggleWorkspaces(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.workspacesOpen.update((value) => !value);
  }

  protected toggleProjects(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.projectsOpen.update((value) => !value);
  }

  protected selectOrganization(organization: OrganizationListItem): void {
    this.organizationContext.setSelectedOrganization({
      id: organization.id,
      name: organization.name,
      description: organization.description,
      icon: organization.icon,
      role: organization.role,
    });
  }

  protected isSelectedOrganization(organizationId: number): boolean {
    return this.selectedOrganization()?.id === organizationId;
  }

  private loadOrganizations(): void {
    this.organizationsService
      .getMyOrganizations()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (organizations) => {
          this.organizations.set(organizations);
        },
        error: () => {
          this.organizations.set([]);
        },
      });
  }

  private loadInvitationsCount(): void {
    this.organizationsService
      .getMyInvitations()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (invitations) => {
          this.organizationsService.setInvitationsCount(invitations.length);
        },
        error: () => {
          this.organizationsService.setInvitationsCount(0);
        },
      });
  }

  private loadProjects(): void {
    this.projectsService
      .getMyProjects()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (projects) => {
          this.projects.set(projects);
        },
        error: () => {
          this.projects.set([]);
        },
      });
  }
}

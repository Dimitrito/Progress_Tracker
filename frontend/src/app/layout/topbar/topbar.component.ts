import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { OrganizationContextService } from '../../core/services/organization-context.service';

@Component({
  selector: 'app-topbar',
  standalone: true,
  templateUrl: './topbar.component.html',
  styleUrl: './topbar.component.css',
})
export class TopbarComponent {
  protected readonly authService = inject(AuthService);
  protected readonly organizationContext = inject(OrganizationContextService);
  protected readonly organizationName = computed(
    () =>
      this.organizationContext.selectedOrganization()?.name ??
      'No organization selected',
  );

  private readonly router = inject(Router);

  logout(): void {
    this.organizationContext.clearSelectedOrganization();
    this.authService.logout();
    void this.router.navigateByUrl('/login');
  }
}

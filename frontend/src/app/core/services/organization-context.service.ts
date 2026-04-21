import { Injectable, signal } from '@angular/core';

import { SelectedOrganization } from './organizations.service';

const SELECTED_ORGANIZATION_STORAGE_KEY = 'selected_organization';

@Injectable({
  providedIn: 'root',
})
export class OrganizationContextService {
  private readonly selectedOrganizationSignal =
    signal<SelectedOrganization | null>(null);

  readonly selectedOrganization = this.selectedOrganizationSignal.asReadonly();

  initialize(): void {
    const storedOrganization = localStorage.getItem(
      SELECTED_ORGANIZATION_STORAGE_KEY,
    );

    if (!storedOrganization) {
      return;
    }

    try {
      this.selectedOrganizationSignal.set(
        JSON.parse(storedOrganization) as SelectedOrganization,
      );
    } catch {
      localStorage.removeItem(SELECTED_ORGANIZATION_STORAGE_KEY);
      this.selectedOrganizationSignal.set(null);
    }
  }

  setSelectedOrganization(organization: SelectedOrganization): void {
    this.selectedOrganizationSignal.set(organization);
    localStorage.setItem(
      SELECTED_ORGANIZATION_STORAGE_KEY,
      JSON.stringify(organization),
    );
  }

  clearSelectedOrganization(): void {
    this.selectedOrganizationSignal.set(null);
    localStorage.removeItem(SELECTED_ORGANIZATION_STORAGE_KEY);
  }
}

import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

export type OrganizationApiRole = 'admin' | 'pm' | 'member';

export interface OrganizationListItem {
  id: number;
  name: string;
  description: string;
  icon: string | null;
  role: OrganizationApiRole;
  created_at: string;
}

export type SelectedOrganization = Pick<
  OrganizationListItem,
  'id' | 'name' | 'description' | 'icon' | 'role'
>;

export interface CreateOrganizationPayload {
  name: string;
  description: string;
  icon?: File;
}

export interface UpdateOrganizationPayload {
  name: string;
  description: string;
  icon?: File | null;
  clear_icon?: boolean;
}

export interface OrganizationMember {
  id: number;
  user: number;
  user_email: string;
  role: OrganizationApiRole;
  joined_at: string;
}

export type InvitationStatus = 'pending' | 'accepted' | 'declined';

export interface OrganizationInvitation {
  id: number;
  organization: number;
  organization_name: string;
  invited_user: number;
  invited_user_email: string;
  invited_by: number;
  invited_by_email: string;
  status: InvitationStatus;
  created_at: string;
  responded_at: string | null;
}

export type JoinRequestStatus = 'pending' | 'approved' | 'rejected';

export interface OrganizationJoinRequest {
  id: number;
  organization: number;
  organization_name: string;
  user: number;
  user_email: string;
  status: JoinRequestStatus;
  created_at: string;
  reviewed_at: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class OrganizationsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  getMyOrganizations(): Observable<OrganizationListItem[]> {
    return this.http.get<OrganizationListItem[]>(
      `${this.baseUrl}/organizations/my/`,
    );
  }

  getOrganizationById(organizationId: number): Observable<OrganizationListItem | null> {
    return this.getMyOrganizations().pipe(
      map(
        (organizations) =>
          organizations.find((organization) => organization.id === organizationId) ??
          null,
      ),
    );
  }

  getOrganizationMembers(organizationId: number): Observable<OrganizationMember[]> {
    return this.http.get<OrganizationMember[]>(
      `${this.baseUrl}/organizations/${organizationId}/members/`,
    );
  }

  getPendingInvitationsForOrganization(
    organizationId: number,
  ): Observable<OrganizationInvitation[]> {
    return this.http.get<OrganizationInvitation[]>(
      `${this.baseUrl}/organizations/${organizationId}/invitations/pending/`,
    );
  }

  createOrganization(payload: CreateOrganizationPayload) {
    const formData = new FormData();
    formData.append('name', payload.name);
    formData.append('description', payload.description || '');

    if (payload.icon) {
      formData.append('icon', payload.icon);
    }

    return this.http.post<OrganizationListItem>(
      `${this.baseUrl}/organizations/create/`,
      formData
    );
  }

  updateOrganization(
    organizationId: number,
    payload: UpdateOrganizationPayload,
  ): Observable<OrganizationListItem> {
    const formData = new FormData();
    formData.append('name', payload.name);
    formData.append('description', payload.description || '');

    if (payload.icon) {
      formData.append('icon', payload.icon);
    }

    if (payload.clear_icon) {
      formData.append('clear_icon', 'true');
    }

    return this.http.patch<OrganizationListItem>(
      `${this.baseUrl}/organizations/${organizationId}/`,
      formData,
    );
  }

  inviteUserByEmail(
    organizationId: number,
    invitedUserEmail: string,
  ): Observable<OrganizationInvitation> {
    return this.http.post<OrganizationInvitation>(
      `${this.baseUrl}/organizations/${organizationId}/invite/`,
      { invited_user_email: invitedUserEmail.trim() },
    );
  }

  getMyInvitations(): Observable<OrganizationInvitation[]> {
    return this.http.get<OrganizationInvitation[]>(
      `${this.baseUrl}/organizations/invitations/my/`,
    );
  }

  acceptInvitation(invitationId: number): Observable<OrganizationInvitation> {
    return this.http.post<OrganizationInvitation>(
      `${this.baseUrl}/organizations/invitations/${invitationId}/accept/`,
      {},
    );
  }

  declineInvitation(invitationId: number): Observable<OrganizationInvitation> {
    return this.http.post<OrganizationInvitation>(
      `${this.baseUrl}/organizations/invitations/${invitationId}/decline/`,
      {},
    );
  }

  createJoinRequest(organizationId: number): Observable<OrganizationJoinRequest> {
    return this.http.post<OrganizationJoinRequest>(
      `${this.baseUrl}/organizations/${organizationId}/join-request/`,
      {},
    );
  }

  getReceivedJoinRequests(): Observable<OrganizationJoinRequest[]> {
    return this.http.get<OrganizationJoinRequest[]>(
      `${this.baseUrl}/organizations/join-requests/received/`,
    );
  }

  approveJoinRequest(requestId: number): Observable<OrganizationJoinRequest> {
    return this.http.post<OrganizationJoinRequest>(
      `${this.baseUrl}/organizations/join-requests/${requestId}/approve/`,
      {},
    );
  }

  rejectJoinRequest(requestId: number): Observable<OrganizationJoinRequest> {
    return this.http.post<OrganizationJoinRequest>(
      `${this.baseUrl}/organizations/join-requests/${requestId}/reject/`,
      {},
    );
  }

  deleteOrganization(id: number) {
    return this.http.delete(`${this.baseUrl}/organizations/${id}/delete/`);
  }

  leaveOrganization(id: number) {
    return this.http.post(`${this.baseUrl}/organizations/${id}/leave/`, {});
  }

  removeOrganizationMember(organizationId: number, membershipId: number) {
    return this.http.post(
      `${this.baseUrl}/organizations/${organizationId}/members/${membershipId}/remove/`,
      {},
    );
  }

  cancelInvitation(invitationId: number) {
    return this.http.delete(
      `${this.baseUrl}/organizations/invitations/${invitationId}/cancel/`
    );
  }
}

import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

export interface ProjectTeamRolePreview {
  membership_id: number;
  user: number;
  user_email: string;
  user_avatar: string | null;
  project_role: number | null;
  project_role_name: string | null;
}

export interface ProjectListItem {
  id: number;
  name: string;
  description: string;
  organization: number;
  organization_name: string;
  manager: number | null;
  manager_email: string | null;
  start_date: string | null;
  end_date: string | null;
  team_roles?: ProjectTeamRolePreview[];
  created_at: string;
}

export interface CreateProjectPayload {
  organization: number;
  name: string;
  description?: string;
  manager?: number | null;
  start_date?: string | null;
  end_date?: string | null;
}

export interface UpdateProjectPayload {
  name: string;
  description: string;
  manager: number | null;
  start_date: string | null;
  end_date: string | null;
}

export interface ProjectMembership {
  id: number;
  project: number;
  user: number;
  user_email: string;
  user_avatar: string | null;
  project_role: number | null;
  project_role_name: string | null;
  added_at: string;
}

export interface ProjectRole {
  id: number;
  project: number;
  name: string;
}

export interface CreateProjectRolePayload {
  project: number;
  name: string;
}

export interface UpdateProjectRolePayload {
  name: string;
}

export interface UpdateProjectMemberRolePayload {
  project_role: number | null;
}

@Injectable({
  providedIn: 'root',
})
export class ProjectsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  getMyProjects(organizationId?: number): Observable<ProjectListItem[]> {
    const url = organizationId
      ? `${this.baseUrl}/projects/my/?organization_id=${organizationId}`
      : `${this.baseUrl}/projects/my/`;

    return this.http.get<ProjectListItem[]>(url);
  }

  getProjectById(projectId: number): Observable<ProjectListItem> {
    return this.http.get<ProjectListItem>(
      `${this.baseUrl}/projects/${projectId}/`,
    );
  }

  createProject(payload: CreateProjectPayload): Observable<ProjectListItem> {
    return this.http.post<ProjectListItem>(
      `${this.baseUrl}/projects/create/`,
      payload,
    );
  }

  updateProject(
    projectId: number,
    payload: UpdateProjectPayload,
  ): Observable<ProjectListItem> {
    return this.http.patch<ProjectListItem>(
      `${this.baseUrl}/projects/${projectId}/`,
      payload,
    );
  }

  getProjectMembers(projectId: number): Observable<ProjectMembership[]> {
    return this.http.get<ProjectMembership[]>(
      `${this.baseUrl}/projects/${projectId}/members/`,
    );
  }

  addProjectMember(payload: {
    project: number;
    user: number;
    project_role?: number | null;
  }): Observable<ProjectMembership> {
    return this.http.post<ProjectMembership>(
      `${this.baseUrl}/projects/members/add/`,
      payload,
    );
  }

  updateProjectMemberRole(
    projectId: number,
    membershipId: number,
    payload: UpdateProjectMemberRolePayload,
  ): Observable<ProjectMembership> {
    return this.http.patch<ProjectMembership>(
      `${this.baseUrl}/projects/${projectId}/members/${membershipId}/`,
      payload,
    );
  }

  deleteProject(projectId: number): Observable<void> {
    return this.http.delete<void>(
      `${this.baseUrl}/projects/${projectId}/`,
    );
  }

  removeProjectMember(
    projectId: number,
    membershipId: number,
  ): Observable<void> {
    return this.http.delete<void>(
      `${this.baseUrl}/projects/${projectId}/members/${membershipId}/remove/`,
    );
  }

  getProjectRoles(projectId: number): Observable<ProjectRole[]> {
    return this.http.get<ProjectRole[]>(
      `${this.baseUrl}/projects/${projectId}/roles/`,
    );
  }

  createProjectRole(
    payload: CreateProjectRolePayload,
  ): Observable<ProjectRole> {
    return this.http.post<ProjectRole>(
      `${this.baseUrl}/projects/roles/create/`,
      payload,
    );
  }

  updateProjectRole(
    roleId: number,
    payload: UpdateProjectRolePayload,
  ): Observable<ProjectRole> {
    return this.http.patch<ProjectRole>(
      `${this.baseUrl}/projects/roles/${roleId}/`,
      payload,
    );
  }

  deleteProjectRole(roleId: number): Observable<void> {
    return this.http.delete<void>(
      `${this.baseUrl}/projects/roles/${roleId}/`,
    );
  }
}

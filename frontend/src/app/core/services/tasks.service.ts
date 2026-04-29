import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

export interface TaskGroup {
  id: number;
  project: number;
  name: string;
  color: string;
  position: number;
  task_count: number;
  created_at: string;
}

export interface TaskItem {
  id: number;
  project: number;
  group: number;
  group_name: string;
  title: string;
  description: string;
  assignee: number | null;
  assignee_email: string | null;
  story_points: number;
  deadline: string | null;
  position: number;
  completed_at: string | null;
  created_at: string;
}

export interface CreateTaskPayload {
  group: number;
  title: string;
  description?: string;
  assignee?: number | null;
  story_points?: number;
  deadline?: string | null;
  position?: number;
}

export interface CreateTaskGroupPayload {
  name: string;
  color?: string;
  position?: number;
}

@Injectable({
  providedIn: 'root',
})
export class TasksService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  getProjectGroups(projectId: number): Observable<TaskGroup[]> {
    return this.http.get<TaskGroup[]>(
      `${this.baseUrl}/tasks/projects/${projectId}/groups/`,
    );
  }

  createGroup(
    projectId: number,
    payload: CreateTaskGroupPayload,
  ): Observable<TaskGroup> {
    return this.http.post<TaskGroup>(
      `${this.baseUrl}/tasks/projects/${projectId}/groups/`,
      payload,
    );
  }

  getProjectTasks(projectId: number): Observable<TaskItem[]> {
    return this.http.get<TaskItem[]>(
      `${this.baseUrl}/tasks/projects/${projectId}/tasks/`,
    );
  }

  updateTask(
    taskId: number,
    payload: Partial<TaskItem>,
  ): Observable<TaskItem> {
    return this.http.patch<TaskItem>(
      `${this.baseUrl}/tasks/${taskId}/`,
      payload,
    );
  }

  createTask(projectId: number, payload: CreateTaskPayload): Observable<TaskItem> {
    return this.http.post<TaskItem>(
      `${this.baseUrl}/tasks/projects/${projectId}/tasks/`,
      payload,
    );
  }
  updateGroup(
    groupId: number,
    payload: Partial<CreateTaskGroupPayload>,
  ): Observable<TaskGroup> {
    return this.http.patch<TaskGroup>(
      `${this.baseUrl}/tasks/groups/${groupId}/`,
      payload,
    );
  }

  deleteGroup(groupId: number): Observable<void> {
    return this.http.delete<void>(
      `${this.baseUrl}/tasks/groups/${groupId}/`,
    );
  }
}

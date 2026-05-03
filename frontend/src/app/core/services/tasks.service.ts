import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

export type TaskPriority = 'urgent' | 'high' | 'normal' | 'low';

export interface TaskGroup {
  id: number;
  project: number;
  name: string;
  color: string;
  position: number;
  task_count: number;
  created_at: string;
}

export interface TaskTag {
  id: number;
  project: number;
  name: string;
  color: string;
  created_at: string;
}

export interface TaskItem {
  id: number;
  project: number;
  group: number;
  group_name: string;
  parent_task: number | null;
  title: string;
  description: string;
  assignee: number | null;
  assignee_email: string | null;
  assignee_avatar: string | null;
  priority: TaskPriority | null;
  tags: TaskTag[];
  story_points: number | null;
  active_story_points: number;
  deadline: string | null;
  position: number;
  is_completed: boolean;
  completed_at: string | null;
  subtasks_count: number;
  completed_subtasks_count: number;
  created_at: string;
}

export interface TaskDetailItem extends TaskItem {
  subtasks: TaskItem[];
}

export interface CreateTaskPayload {
  group: number;
  title: string;
  description?: string;
  assignee?: number | null;
  priority?: TaskPriority | null;
  tag_ids?: number[];
  story_points?: number | null;
  deadline?: string | null;
  position?: number;
  is_completed?: boolean;
}

export interface CreateSubtaskPayload {
  title: string;
  description?: string;
  assignee?: number | null;
  priority?: TaskPriority | null;
  tag_ids?: number[];
  story_points?: number | null;
  deadline?: string | null;
  position?: number;
  is_completed?: boolean;
}

export interface UpdateTaskPayload {
  group?: number;
  title?: string;
  description?: string;
  assignee?: number | null;
  priority?: TaskPriority | null;
  tag_ids?: number[];
  story_points?: number | null;
  deadline?: string | null;
  position?: number;
  is_completed?: boolean;
}

export interface CreateTaskGroupPayload {
  name: string;
  color?: string;
  position?: number;
}

export interface CreateTaskTagPayload {
  name: string;
  color?: string;
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

  getProjectTasks(projectId: number): Observable<TaskItem[]> {
    return this.http.get<TaskItem[]>(
      `${this.baseUrl}/tasks/projects/${projectId}/tasks/`,
    );
  }

  getTask(taskId: number): Observable<TaskDetailItem> {
    return this.http.get<TaskDetailItem>(
      `${this.baseUrl}/tasks/${taskId}/`,
    );
  }

  createTask(projectId: number, payload: CreateTaskPayload): Observable<TaskItem> {
    return this.http.post<TaskItem>(
      `${this.baseUrl}/tasks/projects/${projectId}/tasks/`,
      payload,
    );
  }

  createSubtask(
    taskId: number,
    payload: CreateSubtaskPayload,
  ): Observable<TaskItem> {
    return this.http.post<TaskItem>(
      `${this.baseUrl}/tasks/${taskId}/subtasks/`,
      payload,
    );
  }

  getSubtasks(taskId: number): Observable<TaskItem[]> {
    return this.http.get<TaskItem[]>(
      `${this.baseUrl}/tasks/${taskId}/subtasks/`,
    );
  }

  updateTask(
    taskId: number,
    payload: UpdateTaskPayload,
  ): Observable<TaskDetailItem> {
    return this.http.patch<TaskDetailItem>(
      `${this.baseUrl}/tasks/${taskId}/`,
      payload,
    );
  }

  getProjectTags(projectId: number): Observable<TaskTag[]> {
    return this.http.get<TaskTag[]>(
      `${this.baseUrl}/tasks/projects/${projectId}/tags/`,
    );
  }

  deleteTask(taskId: number): Observable<void> {
    return this.http.delete<void>(
      `${this.baseUrl}/tasks/${taskId}/`,
    );
  }

  createTag(
    projectId: number,
    payload: CreateTaskTagPayload,
  ): Observable<TaskTag> {
    return this.http.post<TaskTag>(
      `${this.baseUrl}/tasks/projects/${projectId}/tags/`,
      payload,
    );
  }
}

import { apiRequest, buildQuery } from './apiClient'
import type { Task, TaskCreateRequest, TaskQuery, TaskScope, TaskUpdateRequest } from './types'

export function tasksBasePath(scope: TaskScope): string {
  return scope.kind === 'own' ? '/api/tasks' : `/api/admin/users/${scope.userId}/tasks`
}

export const tasksApi = {
  list: (scope: TaskScope, query: TaskQuery = {}) =>
    apiRequest<Task[]>(
      'GET',
      `${tasksBasePath(scope)}${buildQuery({
        status: query.status && query.status !== 'all' ? query.status : undefined,
        q: query.q?.trim() || undefined,
      })}`,
    ),
  create: (scope: TaskScope, request: TaskCreateRequest) =>
    apiRequest<Task>('POST', tasksBasePath(scope), request),
  update: (scope: TaskScope, id: number, request: TaskUpdateRequest) =>
    apiRequest<Task>('PUT', `${tasksBasePath(scope)}/${id}`, request),
  setCompleted: (scope: TaskScope, id: number, completed: boolean) =>
    apiRequest<Task>('PATCH', `${tasksBasePath(scope)}/${id}/completion`, { completed }),
  remove: (scope: TaskScope, id: number) =>
    apiRequest<void>('DELETE', `${tasksBasePath(scope)}/${id}`),
}

import { apiRequest, buildQuery } from './apiClient'
import type { AdminPasswordResetRequest, AdminUser } from './types'

export const adminApi = {
  listUsers: (q?: string) =>
    apiRequest<AdminUser[]>('GET', `/api/admin/users${buildQuery({ q: q?.trim() || undefined })}`),
  getUser: (userId: number) => apiRequest<AdminUser>('GET', `/api/admin/users/${userId}`),
  setUserEnabled: (userId: number, enabled: boolean) =>
    apiRequest<AdminUser>('PATCH', `/api/admin/users/${userId}/status`, { enabled }),
  resetUserPassword: (userId: number, request: AdminPasswordResetRequest) =>
    apiRequest<AdminUser>('PUT', `/api/admin/users/${userId}/password`, request),
}

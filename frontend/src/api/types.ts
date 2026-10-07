// Mirrors section 3 of docs/plan.md.

export type Role = 'USER' | 'ADMIN'

export interface User {
  id: number
  username: string
  name: string
  role: Role
  createdAt: string
}

export interface LoginRequest {
  username: string
  password: string
}

export interface RegisterRequest {
  username: string
  name: string
  password: string
  confirmPassword: string
}

export interface LoginResponse {
  token: string
  tokenType: string
  expiresIn: number
  user: User
}

export interface ChangePasswordRequest {
  currentPassword: string
  newPassword: string
  confirmNewPassword: string
}

export interface Task {
  id: number
  title: string
  description: string | null
  dueAt: string
  completed: boolean
  completedAt: string | null
  overdue: boolean
  createdAt: string
  updatedAt: string
}

export interface TaskCreateRequest {
  title: string
  description: string | null
  dueAt: string
}

export interface TaskUpdateRequest extends TaskCreateRequest {
  completed: boolean
}

export type TaskStatus = 'all' | 'active' | 'completed'

export interface TaskQuery {
  status?: TaskStatus
  q?: string
}

export type TaskScope = { kind: 'own' } | { kind: 'admin'; userId: number }

export interface AdminUser extends User {
  enabled: boolean
  taskCount: number
  openTaskCount: number
}

export interface AdminPasswordResetRequest {
  newPassword: string
  confirmNewPassword: string
}

export interface FieldErrorDetail {
  field: string
  message: string
}

export interface ApiErrorBody {
  timestamp: string
  status: number
  error: string
  message: string
  path: string
  fieldErrors: FieldErrorDetail[]
}

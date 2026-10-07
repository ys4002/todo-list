import { apiRequest } from './apiClient'
import type { ChangePasswordRequest, LoginRequest, LoginResponse, RegisterRequest, User } from './types'

export const authApi = {
  register: (request: RegisterRequest) => apiRequest<User>('POST', '/api/auth/register', request, { anonymous: true }),
  login: (request: LoginRequest) =>
    apiRequest<LoginResponse>('POST', '/api/auth/login', request, { skipUnauthorizedHandler: true, anonymous: true }),
  me: () => apiRequest<User>('GET', '/api/auth/me'),
  changePassword: (request: ChangePasswordRequest) =>
    apiRequest<LoginResponse>('PUT', '/api/auth/password', request),
}

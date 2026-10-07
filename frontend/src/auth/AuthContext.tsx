import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { configureApiClient } from '../api/apiClient'
import { authApi } from '../api/authApi'
import type { LoginResponse, Role, User } from '../api/types'
import { tokenStorage } from './tokenStorage'
import type { StoredSession } from './tokenStorage'

export type LogoutReason = 'expired' | 'disabled' | 'passwordChanged'

export const DISABLED_MESSAGE = 'Account is disabled'
export const PASSWORD_CHANGED_MESSAGE = 'Password has been changed. Please log in again.'

export function homePathFor(role: Role): string {
  return role === 'ADMIN' ? '/admin/users' : '/tasks'
}

interface AuthContextValue {
  user: User | null
  isAdmin: boolean
  /** Why the last session ended (drives the /login banner); null after a plain logout. */
  logoutReason: LogoutReason | null
  login: (username: string, password: string) => Promise<User>
  logout: (reason?: LogoutReason) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function reasonForUnauthorized(message: string): LogoutReason {
  if (message === DISABLED_MESSAGE) return 'disabled'
  if (message === PASSWORD_CHANGED_MESSAGE) return 'passwordChanged'
  return 'expired'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(() => tokenStorage.load())
  const [session, setSession] = useState<StoredSession | null>(initial.session)
  const [logoutReason, setLogoutReason] = useState<LogoutReason | null>(initial.expired ? 'expired' : null)

  // ProtectedRoute redirects to /login (with the reason) once the session is gone.
  const logout = useCallback((reason?: LogoutReason) => {
    tokenStorage.clear()
    setSession(null)
    setLogoutReason(reason ?? null)
  }, [])
  const logoutRef = useRef(logout)
  useLayoutEffect(() => {
    logoutRef.current = logout
  }, [logout])

  // Layout effect so the client is configured before any child effect fires a request.
  useLayoutEffect(() => {
    configureApiClient({
      getToken: tokenStorage.getToken,
      onTokenRenewed: (token, expiresInSeconds) => {
        const expiresAt = Date.now() + expiresInSeconds * 1000
        tokenStorage.saveToken(token, expiresAt)
        setSession((current) => (current ? { ...current, token, expiresAt } : current))
      },
      onUnauthorized: (message) => logoutRef.current(reasonForUnauthorized(message)),
    })
  }, [])

  const expiresAt = session?.expiresAt
  useEffect(() => {
    if (expiresAt === undefined) return
    const timer = setTimeout(() => logoutRef.current('expired'), Math.max(0, expiresAt - Date.now()))
    return () => clearTimeout(timer)
  }, [expiresAt])

  const login = useCallback(async (username: string, password: string) => {
    const response: LoginResponse = await authApi.login({ username, password })
    const next: StoredSession = {
      token: response.token,
      user: response.user,
      expiresAt: Date.now() + response.expiresIn * 1000,
    }
    tokenStorage.save(next)
    setSession(next)
    setLogoutReason(null)
    return response.user
  }, [])

  const user = session?.user ?? null
  const value = useMemo<AuthContextValue>(
    () => ({ user, isAdmin: user?.role === 'ADMIN', logoutReason, login, logout }),
    [user, logoutReason, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}

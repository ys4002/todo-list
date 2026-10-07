import type { User } from '../api/types'

const TOKEN_KEY = 'todo_app_token'
const USER_KEY = 'todo_app_user'
const EXPIRES_KEY = 'todo_app_expires_at'

export interface StoredSession {
  token: string
  user: User
  expiresAt: number
}

function safe<T>(action: () => T, fallback: T): T {
  try {
    return action()
  } catch {
    return fallback
  }
}

export const tokenStorage = {
  getToken: (): string | null => safe(() => localStorage.getItem(TOKEN_KEY), null),

  save(session: StoredSession): void {
    safe(() => {
      localStorage.setItem(TOKEN_KEY, session.token)
      localStorage.setItem(USER_KEY, JSON.stringify(session.user))
      localStorage.setItem(EXPIRES_KEY, String(session.expiresAt))
    }, undefined)
  },

  /** Replace only the token and expiry (sliding session renewal). */
  saveToken(token: string, expiresAt: number): void {
    safe(() => {
      localStorage.setItem(TOKEN_KEY, token)
      localStorage.setItem(EXPIRES_KEY, String(expiresAt))
    }, undefined)
  },

  clear(): void {
    safe(() => {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
      localStorage.removeItem(EXPIRES_KEY)
    }, undefined)
  },

  /**
   * Reads the stored session. A session whose expiry has passed (or that is
   * unreadable) is cleared; `expired` is true only when a valid-looking session had run out.
   */
  load(now: number = Date.now()): { session: StoredSession | null; expired: boolean } {
    const token = safe(() => localStorage.getItem(TOKEN_KEY), null)
    const userJson = safe(() => localStorage.getItem(USER_KEY), null)
    const expiresAt = Number(safe(() => localStorage.getItem(EXPIRES_KEY), null))
    if (!token || !userJson || !Number.isFinite(expiresAt) || expiresAt <= 0) {
      if (token || userJson) tokenStorage.clear()
      return { session: null, expired: false }
    }
    let user: User
    try {
      user = JSON.parse(userJson) as User
    } catch {
      tokenStorage.clear()
      return { session: null, expired: false }
    }
    if (expiresAt <= now) {
      tokenStorage.clear()
      return { session: null, expired: true }
    }
    return { session: { token, user, expiresAt }, expired: false }
  },
}

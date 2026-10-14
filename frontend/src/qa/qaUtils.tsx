import { render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { vi } from 'vitest'
import { AppRoutes } from '../App'
import type { AdminUser, Role, Task, User } from '../api/types'
import { AuthProvider } from '../auth/AuthContext'

// QA-owned helpers. Only the public pieces of the app (AppRoutes, AuthProvider) and the
// localStorage keys from the plan (2.4) are used.

export const TOKEN_KEY = 'todo_app_token'
export const USER_KEY = 'todo_app_user'
export const EXPIRES_KEY = 'todo_app_expires_at'

export const alice: User = { id: 2, username: 'alice_01', name: 'Alice Smith', role: 'USER', createdAt: '2026-10-07T14:03:22.123Z' }
export const adminUser: User = { id: 1, username: 'admin', name: 'Administrator', role: 'ADMIN', createdAt: '2026-10-01T08:00:00.000Z' }

export function adminRow(user: User, overrides: Partial<AdminUser> = {}): AdminUser {
  return { ...user, enabled: true, taskCount: 3, openTaskCount: 2, ...overrides }
}

export function seedSession(role: Role = 'USER', expiresAt = Date.now() + 3_600_000) {
  localStorage.setItem(TOKEN_KEY, 'stored-token')
  localStorage.setItem(USER_KEY, JSON.stringify(role === 'ADMIN' ? adminUser : alice))
  localStorage.setItem(EXPIRES_KEY, String(expiresAt))
}

let taskSeq = 100
export function task(overrides: Partial<Task> = {}): Task {
  const id = overrides.id ?? taskSeq++
  return {
    id,
    title: `Task ${id}`,
    description: null,
    dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    completed: false,
    completedAt: null,
    overdue: false,
    createdAt: '2026-10-07T14:05:00Z',
    updatedAt: '2026-10-07T14:05:00Z',
    ...overrides,
  }
}

export const inMs = (ms: number) => new Date(Date.now() + ms).toISOString()
export const HOUR = 3_600_000

/** Local-time value for <input type="datetime-local">, built without the app's own helpers. */
export function localValue(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function Where() {
  const location = useLocation()
  return <div data-testid="where">{location.pathname + location.search}</div>
}
export const where = () => screen.getByTestId('where').textContent

export function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <AppRoutes />
        <Where />
      </AuthProvider>
    </MemoryRouter>,
  )
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  if (status === 204) return new Response(null, { status })
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

export function apiError(status: number, message: string, fieldErrors: { field: string; message: string }[] = [], headers = {}) {
  return json({ timestamp: '2026-10-07T14:03:22.123Z', status, error: 'x', message, path: '/x', fieldErrors }, status, headers)
}

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>

/** Mocks fetch; routes are keyed "METHOD /path" (query string ignored). Unknown calls throw. */
export function mockApi(routes: Record<string, Handler | Response>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init = {}) => {
    const url = String(input)
    const method = (init.method ?? 'GET').toUpperCase()
    const handler = routes[`${method} ${url.split('?')[0]}`]
    if (!handler) throw new Error(`Unexpected fetch: ${method} ${url}`)
    return typeof handler === 'function' ? handler(url, init) : handler.clone()
  })
}

type Spy = ReturnType<typeof mockApi>
export const callsTo = (spy: Spy, method: string, path: string) =>
  spy.mock.calls.filter(([url, init]) => (init?.method ?? 'GET').toUpperCase() === method && String(url).split('?')[0] === path)
export const urlsOf = (spy: Spy, method: string, path: string) => callsTo(spy, method, path).map(([url]) => String(url))
export const bodyOf = (spy: Spy, method: string, path: string) => {
  const calls = callsTo(spy, method, path)
  return JSON.parse(String(calls[calls.length - 1][1]?.body))
}

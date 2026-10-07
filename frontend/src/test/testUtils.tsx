import { render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { vi } from 'vitest'
import { AppRoutes } from '../App'
import type { Role, User } from '../api/types'
import { AuthProvider } from '../auth/AuthContext'

export function makeUser(role: Role = 'USER', overrides: Partial<User> = {}): User {
  return {
    id: role === 'ADMIN' ? 1 : 2,
    username: role === 'ADMIN' ? 'admin' : 'alice_01',
    name: role === 'ADMIN' ? 'Administrator' : 'Alice Smith',
    role,
    createdAt: '2026-10-07T14:03:22.123Z',
    ...overrides,
  }
}

export function seedSession(role: Role = 'USER', expiresAt = Date.now() + 3_600_000, user = makeUser(role)) {
  localStorage.setItem('todo_app_token', 'stored-token')
  localStorage.setItem('todo_app_user', JSON.stringify(user))
  localStorage.setItem('todo_app_expires_at', String(expiresAt))
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

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  if (status === 204) return new Response(null, { status })
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

export function errorResponse(
  status: number,
  message: string,
  fieldErrors: { field: string; message: string }[] = [],
  headers: Record<string, string> = {},
) {
  return jsonResponse({ status, message, fieldErrors }, status, headers)
}

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>

/**
 * Mocks fetch. `routes` are matched in order by "METHOD path" (path without query, exact),
 * unmatched calls fail the test loudly.
 */
export function mockApi(routes: Record<string, Handler | Response>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init = {}) => {
    const url = String(input)
    const method = (init.method ?? 'GET').toUpperCase()
    const key = `${method} ${url.split('?')[0]}`
    const handler = routes[key]
    if (!handler) throw new Error(`Unexpected fetch: ${method} ${url}`)
    return typeof handler === 'function' ? handler(url, init) : handler.clone()
  })
}

export function fetchCalls(spy: ReturnType<typeof mockApi>, method: string, path: string) {
  return spy.mock.calls.filter(
    ([url, init]) => (init?.method ?? 'GET') === method && String(url).split('?')[0] === path,
  )
}

export function lastBody(spy: ReturnType<typeof mockApi>, method: string, path: string) {
  const calls = fetchCalls(spy, method, path)
  return JSON.parse(String(calls[calls.length - 1][1]?.body))
}

import type { Task } from '../api/types'

let nextTaskId = 1
export function makeTask(overrides: Partial<Task> = {}): Task {
  const id = overrides.id ?? nextTaskId++
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

export const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString()

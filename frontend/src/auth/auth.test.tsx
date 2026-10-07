import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../App'
import { tasksApi } from '../api/tasksApi'
import type { Role } from '../api/types'
import { AuthProvider } from './AuthContext'

function seedSession(role: Role, expiresAt = Date.now() + 3_600_000) {
  localStorage.setItem('todo_app_token', 'stored-token')
  localStorage.setItem(
    'todo_app_user',
    JSON.stringify({ id: 1, username: role === 'ADMIN' ? 'admin' : 'alice_01', name: 'N', role, createdAt: '2026-10-07T00:00:00Z' }),
  )
  localStorage.setItem('todo_app_expires_at', String(expiresAt))
}

function Where() {
  const location = useLocation()
  return <div data-testid="where">{location.pathname + location.search}</div>
}

function Ping() {
  return <button onClick={() => tasksApi.list({ kind: 'own' }).catch(() => {})}>ping</button>
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <AppRoutes />
        <Ping />
        <Where />
      </AuthProvider>
    </MemoryRouter>,
  )
}

const where = () => screen.getByTestId('where').textContent

function mockFetch(response: () => Response) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => response())
}

describe('routing (UI10-UI12, UI27)', () => {
  it('redirects a logged-out visitor from /tasks to /login', () => {
    renderAt('/tasks')
    expect(where()).toBe('/login')
  })

  it.each([
    ['USER', '/tasks'],
    ['ADMIN', '/admin/users'],
  ] as const)('sends a logged-in %s from /login to %s', (role, home) => {
    seedSession(role)
    renderAt('/login')
    expect(where()).toBe(home)
  })

  it('sends "/" to the role home page', () => {
    seedSession('ADMIN')
    renderAt('/')
    expect(where()).toBe('/admin/users')
  })

  it('shows Access denied to a USER on /admin/users with no admin fetch', () => {
    seedSession('USER')
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    renderAt('/admin/users')
    expect(screen.getByRole('heading', { name: 'Access denied' })).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('shows the Users link only for ADMIN', () => {
    seedSession('USER')
    const { unmount } = renderAt('/tasks')
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Profile' })).toBeInTheDocument()
    unmount()
    localStorage.clear()
    seedSession('ADMIN')
    renderAt('/tasks')
    expect(screen.getByRole('link', { name: 'Users' })).toBeInTheDocument()
  })

  it('Logout clears storage and goes to /login', async () => {
    seedSession('USER')
    renderAt('/tasks')
    await userEvent.click(screen.getByRole('button', { name: 'Logout' }))
    expect(where()).toBe('/login')
    expect(localStorage.getItem('todo_app_token')).toBeNull()
  })

  it('renders NotFoundPage for unknown routes', () => {
    seedSession('USER')
    renderAt('/nope')
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })
})

describe('session (UI24-UI26, UI36)', () => {
  beforeEach(() => seedSession('USER'))
  afterEach(() => vi.useRealTimers())

  it('stores a renewed token and expiry from response headers', async () => {
    mockFetch(
      () => new Response('[]', { status: 200, headers: { 'X-Auth-Token': 'renewed', 'X-Auth-Expires-In': '3600' } }),
    )
    const before = Date.now()
    renderAt('/tasks')
    await userEvent.click(screen.getByText('ping'))
    expect(localStorage.getItem('todo_app_token')).toBe('renewed')
    expect(Number(localStorage.getItem('todo_app_expires_at'))).toBeGreaterThanOrEqual(before + 3_600_000)
  })

  it('sends the stored bearer token', async () => {
    const spy = mockFetch(() => new Response('[]', { status: 200 }))
    renderAt('/tasks')
    await userEvent.click(screen.getByText('ping'))
    expect(spy.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer stored-token' })
  })

  it.each([
    ['Authentication required', '/login?expired=1'],
    ['Account is disabled', '/login?disabled=1'],
    ['Password has been changed. Please log in again.', '/login?passwordChanged=1'],
  ])('maps 401 "%s" to %s', async (message, target) => {
    mockFetch(() => new Response(JSON.stringify({ message, fieldErrors: [] }), { status: 401 }))
    renderAt('/tasks')
    await userEvent.click(screen.getByText('ping'))
    expect(where()).toBe(target)
    expect(localStorage.getItem('todo_app_token')).toBeNull()
  })

  it('does not log out on 403', async () => {
    mockFetch(() => new Response(JSON.stringify({ message: 'Access denied', fieldErrors: [] }), { status: 403 }))
    renderAt('/tasks')
    await userEvent.click(screen.getByText('ping'))
    expect(where()).toBe('/tasks')
    expect(localStorage.getItem('todo_app_token')).toBe('stored-token')
  })

  it('logs out when the expiry timer fires', () => {
    vi.useFakeTimers()
    seedSession('USER', Date.now() + 60_000)
    renderAt('/tasks')
    expect(where()).toBe('/tasks')
    act(() => {
      vi.advanceTimersByTime(60_001)
    })
    expect(where()).toBe('/login?expired=1')
    expect(localStorage.getItem('todo_app_token')).toBeNull()
  })

  it('discards a token that already expired on load and redirects with ?expired=1', () => {
    seedSession('USER', Date.now() - 1000)
    renderAt('/tasks')
    expect(where()).toBe('/login?expired=1')
    expect(localStorage.getItem('todo_app_token')).toBeNull()
  })
})

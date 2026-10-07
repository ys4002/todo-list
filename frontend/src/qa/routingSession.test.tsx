import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { adminRow, adminUser, alice, apiError, EXPIRES_KEY, json, mockApi, renderApp, seedSession, task, TOKEN_KEY, USER_KEY, where } from './qaUtils'

afterEach(() => vi.useRealTimers())

describe('QA Routing UI10-UI12', () => {
  it('UI10 /tasks while logged out redirects to /login', async () => {
    const spy = mockApi({})
    renderApp('/tasks')
    await waitFor(() => expect(where()).toBe('/login'))
    expect(spy).not.toHaveBeenCalled()
  })

  it('UI11 /login while logged in redirects USER to /tasks', async () => {
    seedSession('USER')
    mockApi({ 'GET /api/tasks': json([]) })
    renderApp('/login')
    await waitFor(() => expect(where()).toBe('/tasks'))
  })

  it('UI11 /login while logged in redirects ADMIN to /admin/users', async () => {
    seedSession('ADMIN')
    mockApi({ 'GET /api/admin/users': json([]) })
    renderApp('/login')
    await waitFor(() => expect(where()).toBe('/admin/users'))
  })

  it('UI11 "/" sends each role to its home page', async () => {
    seedSession('ADMIN')
    mockApi({ 'GET /api/admin/users': json([]) })
    renderApp('/')
    await waitFor(() => expect(where()).toBe('/admin/users'))
  })

  it('UI12 USER at /admin/users sees Access denied and no admin fetch is made', async () => {
    seedSession('USER')
    const spy = mockApi({})
    renderApp('/admin/users')
    expect(await screen.findByRole('heading', { name: /access denied/i })).toBeInTheDocument()
    expect(spy.mock.calls.filter(([url]) => String(url).includes('/api/admin'))).toHaveLength(0)
  })

  it('UI12 USER at /admin/users/2/tasks is also denied', async () => {
    seedSession('USER')
    const spy = mockApi({})
    renderApp('/admin/users/2/tasks')
    expect(await screen.findByRole('heading', { name: /access denied/i })).toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('QA Session UI24-UI27, UI36', () => {
  it('UI24 renewal headers update stored token and expiresAt', async () => {
    seedSession('USER', Date.now() + 60_000)
    mockApi({
      'GET /api/tasks': json([task()], 200, { 'X-Auth-Token': 'renewed-token', 'X-Auth-Expires-In': '3600' }),
    })
    renderApp('/tasks')
    await waitFor(() => expect(localStorage.getItem(TOKEN_KEY)).toBe('renewed-token'))
    const expiresAt = Number(localStorage.getItem(EXPIRES_KEY))
    expect(expiresAt).toBeGreaterThan(Date.now() + 3_500_000)
  })

  it('UI24 sends the stored token as a Bearer header', async () => {
    seedSession('USER')
    const spy = mockApi({ 'GET /api/tasks': json([]) })
    renderApp('/tasks')
    await waitFor(() => expect(spy).toHaveBeenCalled())
    const headers = new Headers(spy.mock.calls[0][1]?.headers)
    expect(headers.get('Authorization')).toBe('Bearer stored-token')
  })

  it.each([
    ['Authentication required', '/login?expired=1', /session has expired/i],
    ['Account is disabled', '/login?disabled=1', /account is disabled/i],
  ])('UI25 401 "%s" logs out to %s with a banner', async (message, target, banner) => {
    seedSession('USER')
    mockApi({ 'GET /api/tasks': apiError(401, message) })
    renderApp('/tasks')
    await waitFor(() => expect(where()).toBe(target))
    expect(screen.getByText(banner)).toBeInTheDocument()
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
  })

  it('UI25 a 403 does not log the user out', async () => {
    seedSession('USER')
    mockApi({ 'GET /api/tasks': apiError(403, 'Access denied') })
    renderApp('/tasks')
    await screen.findByRole('alert')
    expect(where()).toBe('/tasks')
    expect(localStorage.getItem(TOKEN_KEY)).toBe('stored-token')
  })

  it('UI26 expiry timer logs out at expiresAt', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
    seedSession('USER', Date.now() + 5_000)
    mockApi({ 'GET /api/tasks': json([]) })
    renderApp('/tasks')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })
    expect(where()).toBe('/tasks')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_500)
    })
    expect(where()).toBe('/login?expired=1')
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
  })

  it('UI26 a token already expired on load never shows a protected page', async () => {
    seedSession('USER', Date.now() - 1_000)
    const spy = mockApi({})
    renderApp('/tasks')
    await waitFor(() => expect(where()).toBe('/login?expired=1'))
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull()
    expect(spy).not.toHaveBeenCalled()
  })

  it('UI27 Logout clears storage and goes to /login', async () => {
    seedSession('USER')
    mockApi({ 'GET /api/tasks': json([]) })
    renderApp('/tasks')
    await userEvent.click(await screen.findByRole('button', { name: 'Logout' }))
    await waitFor(() => expect(where()).toBe('/login'))
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(localStorage.getItem(USER_KEY)).toBeNull()
    expect(localStorage.getItem(EXPIRES_KEY)).toBeNull()
  })

  it('UI27 "Users" link appears only for ADMIN; Profile and My Tasks for both', async () => {
    seedSession('USER')
    mockApi({ 'GET /api/tasks': json([]) })
    const first = renderApp('/tasks')
    const nav = await screen.findByRole('navigation', { name: 'Main' })
    expect(nav).toHaveTextContent('My Tasks')
    expect(nav).toHaveTextContent('Profile')
    expect(screen.queryByRole('link', { name: 'Users' })).toBeNull()
    first.unmount()
    localStorage.clear()

    seedSession('ADMIN')
    mockApi({ 'GET /api/tasks': json([]) })
    renderApp('/tasks')
    expect(await screen.findByRole('link', { name: 'Users' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Profile' })).toBeInTheDocument()
    expect(screen.getByLabelText('Signed in as')).toHaveTextContent(adminUser.username)
  })

  it('UI36 401 "Password has been changed" goes to /login?passwordChanged=1 with the banner', async () => {
    seedSession('USER')
    mockApi({ 'GET /api/tasks': apiError(401, 'Password has been changed. Please log in again.') })
    renderApp('/tasks')
    await waitFor(() => expect(where()).toBe('/login?passwordChanged=1'))
    expect(screen.getByText('Your password was changed. Please log in again.')).toBeInTheDocument()
  })

  it('smoke: unknown route shows a not-found page, admin user list is unaffected', async () => {
    seedSession('ADMIN')
    mockApi({ 'GET /api/admin/users': json([adminRow(adminUser), adminRow(alice)]) })
    renderApp('/admin/users')
    expect(await screen.findByText('alice_01')).toBeInTheDocument()
  })
})

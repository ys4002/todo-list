import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { alice, apiError, json, mockApi, renderApp, seedSession, task, where } from '../qa/qaUtils'

afterEach(() => vi.useRealTimers())

const fakeTimers = () => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

describe('notification flows', () => {
  it('a failed save keeps the change staged, shows one error toast and dismisses it after 8 seconds', async () => {
    fakeTimers()
    seedSession('USER')
    mockApi({
      'GET /api/tasks': json([task({ id: 8, title: 'Fail me' })]),
      'PATCH /api/tasks/8/completion': apiError(500, 'Unexpected error'),
    })
    renderApp('/tasks')
    await advance(10)
    const box = screen.getByRole('checkbox', { name: "Mark 'Fail me' as completed" })
    fireEvent.click(box)
    fireEvent.click(screen.getByRole('button', { name: "Save completion change for 'Fail me'" }))
    await advance(10)
    // one toast plus the row's own "Not saved" line
    expect(screen.getAllByText('Unexpected error')).toHaveLength(1)
    expect(screen.getByText('Not saved. Try again.')).toBeInTheDocument()
    expect(box).toBeChecked()
    await advance(7900)
    expect(screen.getByText('Unexpected error')).toBeInTheDocument()
    await advance(300)
    expect(screen.queryByText('Unexpected error')).toBeNull()
    expect(screen.getByText('Not saved. Try again.')).toBeInTheDocument()
  })

  it('a 401 on toggle shows no error toast, only the login expiry notice', async () => {
    seedSession('USER')
    mockApi({
      'GET /api/tasks': json([task({ id: 8, title: 'Expire me' })]),
      'PATCH /api/tasks/8/completion': apiError(401, 'Authentication required'),
    })
    renderApp('/tasks')
    fireEvent.click(await screen.findByRole('checkbox', { name: "Mark 'Expire me' as completed" }))
    fireEvent.click(screen.getByRole('button', { name: "Save completion change for 'Expire me'" }))
    await waitFor(() => expect(where()).toBe('/login?expired=1'))
    expect(screen.getAllByText(/session has expired/i)).toHaveLength(1)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('the ?registered notice is a toast on /login and is gone after logging in', async () => {
    mockApi({
      'POST /api/auth/login': json({ token: 'tok-user', tokenType: 'Bearer', expiresIn: 3600, user: alice }),
      'GET /api/tasks': json([]),
    })
    renderApp('/login?registered=1')
    expect(screen.getByRole('status')).toHaveTextContent('Registration successful. Please log in.')
    await userEvent.type(screen.getByLabelText('Username'), 'alice_01')
    await userEvent.type(screen.getByLabelText('Password'), 'Str0ng!Pass')
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
    await waitFor(() => expect(where()).toBe('/tasks'))
    await waitFor(() => expect(screen.queryByText('Registration successful. Please log in.')).toBeNull())
  })

  it('the change-password toast is unaffected by a later inline field error', async () => {
    seedSession('USER')
    let call = 0
    mockApi({
      'PUT /api/auth/password': () =>
        ++call === 1
          ? json({ token: 'fresh-token', tokenType: 'Bearer', expiresIn: 3600, user: alice })
          : apiError(400, 'Validation failed', [{ field: 'currentPassword', message: 'Current password is incorrect' }]),
    })
    renderApp('/profile')
    const fill = async (current: string) => {
      await userEvent.type(screen.getByLabelText('Current password'), current)
      await userEvent.type(screen.getByLabelText('New password'), 'N3w#Secret')
      await userEvent.type(screen.getByLabelText('Confirm new password'), 'N3w#Secret')
      await userEvent.click(screen.getByRole('button', { name: 'Change password' }))
    }
    await fill('Str0ng!Pass')
    expect(await screen.findByText('Password changed')).toBeInTheDocument()
    await fill('Wr0ng!Passw')
    expect(await screen.findByText('Current password is incorrect')).toBeInTheDocument()
    expect(screen.getByText('Password changed')).toBeInTheDocument()
  })

  it('a list load failure stays an inline banner and no toast is shown', async () => {
    fakeTimers()
    seedSession('USER')
    mockApi({ 'GET /api/tasks': apiError(500, 'Unexpected error') })
    renderApp('/tasks')
    await advance(10)
    expect(screen.getByRole('alert')).toHaveTextContent('Unexpected error')
    expect(screen.getByLabelText('Notifications')).toBeEmptyDOMElement()
    await advance(10_000)
    expect(screen.getByRole('alert')).toHaveTextContent('Unexpected error')
  })

  it('a password-changed logout leaves only the login notice, not the earlier success toast', async () => {
    seedSession('USER')
    mockApi({
      'PUT /api/auth/password': json({ token: 'fresh-token', tokenType: 'Bearer', expiresIn: 3600, user: alice }),
      'GET /api/tasks': apiError(401, 'Password has been changed. Please log in again.'),
    })
    renderApp('/profile')
    await userEvent.type(screen.getByLabelText('Current password'), 'Str0ng!Pass')
    await userEvent.type(screen.getByLabelText('New password'), 'N3w#Secret')
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'N3w#Secret')
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }))
    expect(await screen.findByText('Password changed')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: /tasks/i }))
    await waitFor(() => expect(where()).toBe('/login?passwordChanged=1'))
    expect(screen.queryByText('Password changed')).toBeNull()
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent('Your password was changed. Please log in again.')
  })

  it('Logout right after a success toast leaves no toast on /login', async () => {
    seedSession('USER')
    mockApi({
      'PUT /api/auth/password': json({ token: 'fresh-token', tokenType: 'Bearer', expiresIn: 3600, user: alice }),
    })
    renderApp('/profile')
    await userEvent.type(screen.getByLabelText('Current password'), 'Str0ng!Pass')
    await userEvent.type(screen.getByLabelText('New password'), 'N3w#Secret')
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'N3w#Secret')
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }))
    expect(await screen.findByText('Password changed')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Logout' }))
    await waitFor(() => expect(where()).toBe('/login'))
    expect(screen.getByLabelText('Notifications')).toBeEmptyDOMElement()
  })

  it('session expiry after an error toast leaves only the expiry notice', async () => {
    fakeTimers()
    seedSession('USER', Date.now() + 20_000)
    mockApi({
      'GET /api/tasks': json([task({ id: 8, title: 'Fail me' })]),
      'PATCH /api/tasks/8/completion': apiError(500, 'Unexpected error'),
    })
    renderApp('/tasks')
    await advance(10)
    fireEvent.click(screen.getByRole('checkbox', { name: "Mark 'Fail me' as completed" }))
    fireEvent.click(screen.getByRole('button', { name: "Save completion change for 'Fail me'" }))
    await advance(10)
    expect(screen.getByText('Unexpected error')).toBeInTheDocument()
    await advance(20_000)
    expect(where()).toBe('/login?expired=1')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent('Your session has expired')
  })
})

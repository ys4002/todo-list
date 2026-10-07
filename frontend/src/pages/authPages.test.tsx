import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { errorResponse, fetchCalls, jsonResponse, lastBody, makeUser, mockApi, renderApp, seedSession, where } from '../test/testUtils'

const type = (label: string | RegExp, text: string) => userEvent.type(screen.getByLabelText(label), text)

async function fillRegister(overrides: Partial<Record<'username' | 'name' | 'password' | 'confirm', string>> = {}) {
  const v = { username: 'alice_01', name: 'Alice Smith', password: 'Str0ng!Pass', confirm: 'Str0ng!Pass', ...overrides }
  if (v.username) await type('Username', v.username)
  if (v.name) await type('Name', v.name)
  if (v.password) await type('Password', v.password)
  if (v.confirm) await type('Confirm password', v.confirm)
}

describe('Register (UI1-UI6)', () => {
  it('UI1: empty submit shows all errors and makes no API call', async () => {
    const spy = mockApi({})
    renderApp('/register')
    await userEvent.click(screen.getByRole('button', { name: 'Register' }))
    expect(screen.getByText('Username is required')).toBeInTheDocument()
    expect(screen.getByText('Name is required')).toBeInTheDocument()
    expect(screen.getByText(/^Password must be 8-64 characters/)).toBeInTheDocument()
    expect(screen.getByText('Confirm password is required')).toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()
  })

  it('UI2: checklist ticks live and a weak password blocks submit', async () => {
    const spy = mockApi({})
    renderApp('/register')
    const rules = screen.getByRole('list', { name: 'Password rules' })
    const met = () => rules.querySelectorAll('[data-met="true"]').length
    expect(met()).toBe(0)
    await type('Password', 'Abcdefg1!')
    expect(met()).toBe(7)
    await userEvent.clear(screen.getByLabelText('Password'))
    await type('Password', 'abc')
    expect(rules.querySelector('[data-met="true"]')?.textContent).toContain('lower-case')
    await fillRegister({ password: '', confirm: 'abc', username: 'alice_01', name: 'Alice' })
    await userEvent.click(screen.getByRole('button', { name: 'Register' }))
    expect(screen.getByText(/^Password must be 8-64 characters/)).toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()
  })

  it('UI3: different confirm password', async () => {
    const spy = mockApi({})
    renderApp('/register')
    await fillRegister({ confirm: 'Different1!' })
    await userEvent.click(screen.getByRole('button', { name: 'Register' }))
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()
  })

  it('UI4: invalid username', async () => {
    mockApi({})
    renderApp('/register')
    await fillRegister({ username: '1abc' })
    await userEvent.click(screen.getByRole('button', { name: 'Register' }))
    expect(screen.getByText(/^Username must be 3-30 characters/)).toBeInTheDocument()
  })

  it('UI5: 409 shows the message at the username, keeps values, clears passwords', async () => {
    mockApi({ 'POST /api/auth/register': errorResponse(409, 'Username is already taken') })
    renderApp('/register')
    await fillRegister()
    await userEvent.click(screen.getByRole('button', { name: 'Register' }))
    expect(await screen.findByText('Username is already taken')).toBeInTheDocument()
    expect(screen.getByLabelText('Username')).toHaveValue('alice_01')
    expect(screen.getByLabelText('Name')).toHaveValue('Alice Smith')
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(screen.getByLabelText('Confirm password')).toHaveValue('')
  })

  it('UI5: 400 fieldErrors are shown next to their fields', async () => {
    mockApi({
      'POST /api/auth/register': errorResponse(400, 'Validation failed', [
        { field: 'name', message: 'Name is required' },
      ]),
    })
    renderApp('/register')
    await fillRegister()
    await userEvent.click(screen.getByRole('button', { name: 'Register' }))
    expect(await screen.findByText('Name is required')).toBeInTheDocument()
  })

  it('UI6: success goes to /login?registered=1 with a banner', async () => {
    const spy = mockApi({ 'POST /api/auth/register': jsonResponse(makeUser(), 201) })
    renderApp('/register')
    await fillRegister()
    await userEvent.click(screen.getByRole('button', { name: 'Register' }))
    await waitFor(() => expect(where()).toBe('/login?registered=1'))
    expect(screen.getByText('Registration successful. Please log in.')).toBeInTheDocument()
    expect(lastBody(spy, 'POST', '/api/auth/register')).toEqual({
      username: 'alice_01', name: 'Alice Smith', password: 'Str0ng!Pass', confirmPassword: 'Str0ng!Pass',
    })
  })
})

describe('Login (UI7-UI9, banners)', () => {
  const login = async () => {
    await type('Username', 'alice_01')
    await type('Password', 'Str0ng!Pass')
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
  }

  it('UI7: 401 and 403 messages', async () => {
    mockApi({ 'POST /api/auth/login': errorResponse(401, 'Invalid username or password') })
    const { unmount } = renderApp('/login')
    await login()
    expect(await screen.findByText('Invalid username or password')).toBeInTheDocument()
    expect(where()).toBe('/login')
    unmount()
    mockApi({ 'POST /api/auth/login': errorResponse(403, 'Account is disabled') })
    renderApp('/login')
    await login()
    expect(await screen.findByText('Your account is disabled. Contact the administrator.')).toBeInTheDocument()
  })

  it('shows the disabled message when the server answers 401 "Account is disabled"', async () => {
    mockApi({ 'POST /api/auth/login': errorResponse(401, 'Account is disabled') })
    renderApp('/login')
    await login()
    expect(await screen.findByText('Your account is disabled. Contact the administrator.')).toBeInTheDocument()
  })

  it.each([
    ['USER', '/tasks'],
    ['ADMIN', '/admin/users'],
  ] as const)('UI8: %s login stores the session and goes to %s', async (role, home) => {
    const user = makeUser(role)
    mockApi({
      'POST /api/auth/login': jsonResponse({ token: 'jwt-1', tokenType: 'Bearer', expiresIn: 3600, user }),
    })
    const before = Date.now()
    renderApp('/login')
    await login()
    await waitFor(() => expect(where()).toBe(home))
    expect(localStorage.getItem('todo_app_token')).toBe('jwt-1')
    expect(JSON.parse(localStorage.getItem('todo_app_user')!)).toEqual(user)
    expect(Number(localStorage.getItem('todo_app_expires_at'))).toBeGreaterThanOrEqual(before + 3_600_000)
  })

  it('UI9: submit is disabled while the request is pending', async () => {
    let release: (r: Response) => void = () => {}
    const spy = mockApi({
      'POST /api/auth/login': () => new Promise<Response>((resolve) => (release = resolve)),
    })
    renderApp('/login')
    await login()
    expect(screen.getByRole('button', { name: 'Log in' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
    expect(fetchCalls(spy, 'POST', '/api/auth/login')).toHaveLength(1)
    release(errorResponse(401, 'Invalid username or password'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled())
  })

  it('validates empty fields without calling the API', async () => {
    const spy = mockApi({})
    renderApp('/login')
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
    expect(screen.getByText('Username is required')).toBeInTheDocument()
    expect(screen.getByText('Password is required')).toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()
  })

  it.each([
    ['expired', 'Your session has expired. Please log in again.'],
    ['disabled', 'Your account is disabled. Contact the administrator.'],
    ['passwordChanged', 'Your password was changed. Please log in again.'],
  ])('shows the ?%s banner', (param, text) => {
    renderApp(`/login?${param}=1`)
    expect(screen.getByText(text)).toBeInTheDocument()
  })
})

describe('Profile (UI31-UI34)', () => {
  it('UI31: shows details, the form and the header link; logged out redirects', () => {
    seedSession('USER')
    const { unmount } = renderApp('/profile')
    expect(screen.getByText('alice_01', { selector: 'dd' })).toBeInTheDocument()
    expect(screen.getByText('Alice Smith')).toBeInTheDocument()
    expect(screen.getByText('USER')).toBeInTheDocument()
    expect(screen.getByText(/October 2026/)).toBeInTheDocument()
    expect(screen.getByRole('form', { name: 'Change password' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Profile' })).toBeInTheDocument()
    unmount()
    localStorage.clear()
    renderApp('/profile')
    expect(where()).toBe('/login')
  })

  const submit = () => userEvent.click(screen.getByRole('button', { name: 'Change password' }))

  it('UI32: client-side validation blocks the call', async () => {
    seedSession('USER')
    const spy = mockApi({})
    renderApp('/profile')
    await submit()
    expect(screen.getByText('Current password is required')).toBeInTheDocument()
    expect(screen.getByText(/^Password must be 8-64 characters/)).toBeInTheDocument()
    expect(screen.getByText('Confirm new password is required')).toBeInTheDocument()

    await type('Current password', 'Str0ng!Pass')
    await type('New password', 'Str0ng!Pass')
    await type('Confirm new password', 'nope')
    await submit()
    expect(screen.getByText('New password must be different from the current password')).toBeInTheDocument()
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument()
    const rules = screen.getByRole('list', { name: 'Password rules' })
    expect(rules.querySelectorAll('[data-met="true"]').length).toBe(7)
    expect(spy).not.toHaveBeenCalled()
  })

  it('UI32: checklist flags a password containing the username', async () => {
    seedSession('USER')
    renderApp('/profile')
    await type('New password', 'xALICE_01!9')
    const unmet = screen.getByRole('list', { name: 'Password rules' }).querySelector('[data-met="false"]')
    expect(unmet?.textContent).toContain('username')
  })

  it('UI33: wrong current password shows a field error and stays logged in', async () => {
    seedSession('USER')
    mockApi({
      'PUT /api/auth/password': errorResponse(400, 'Validation failed', [
        { field: 'currentPassword', message: 'Current password is incorrect' },
      ]),
    })
    renderApp('/profile')
    await type('Current password', 'Wrong!Pass1')
    await type('New password', 'N3w#Secret')
    await type('Confirm new password', 'N3w#Secret')
    await submit()
    expect(await screen.findByText('Current password is incorrect')).toBeInTheDocument()
    expect(where()).toBe('/profile')
    expect(localStorage.getItem('todo_app_token')).toBe('stored-token')
  })

  it('UI34: success shows the banner, clears fields and stores the new token', async () => {
    seedSession('USER')
    const spy = mockApi({
      'PUT /api/auth/password': jsonResponse({ token: 'new-token', tokenType: 'Bearer', expiresIn: 3600, user: makeUser() }),
    })
    renderApp('/profile')
    await type('Current password', 'Str0ng!Pass')
    await type('New password', 'N3w#Secret')
    await type('Confirm new password', 'N3w#Secret')
    await submit()
    expect(await screen.findByText('Password changed')).toBeInTheDocument()
    expect(screen.getByLabelText('Current password')).toHaveValue('')
    expect(screen.getByLabelText('New password')).toHaveValue('')
    expect(localStorage.getItem('todo_app_token')).toBe('new-token')
    expect(where()).toBe('/profile')
    expect(lastBody(spy, 'PUT', '/api/auth/password')).toEqual({
      currentPassword: 'Str0ng!Pass', newPassword: 'N3w#Secret', confirmNewPassword: 'N3w#Secret',
    })
  })
})

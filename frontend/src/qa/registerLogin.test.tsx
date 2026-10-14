import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { adminUser, alice, apiError, bodyOf, callsTo, EXPIRES_KEY, json, mockApi, renderApp, TOKEN_KEY, USER_KEY, where } from './qaUtils'

const STRENGTH =
  'Password must be 8-64 characters with no spaces and include an upper-case letter, a lower-case letter, a digit and a special character'

const typeInto = (label: string, text: string) => userEvent.type(screen.getByLabelText(label), text)

async function fillRegister(v: Partial<Record<'username' | 'name' | 'password' | 'confirm', string>> = {}) {
  const f = { username: 'alice_01', name: 'Alice Smith', password: 'Str0ng!Pass', confirm: 'Str0ng!Pass', ...v }
  if (f.username) await typeInto('Username', f.username)
  if (f.name) await typeInto('Name', f.name)
  if (f.password) await typeInto('Password', f.password)
  if (f.confirm) await typeInto('Confirm password', f.confirm)
}
const submitRegister = () => userEvent.click(screen.getByRole('button', { name: 'Register' }))

describe('QA Register UI1-UI6', () => {
  it('UI1 empty submit shows errors for all four fields and sends nothing', async () => {
    const spy = mockApi({})
    renderApp('/register')
    await submitRegister()
    expect(screen.getByText('Username is required')).toBeInTheDocument()
    expect(screen.getByText('Name is required')).toBeInTheDocument()
    expect(screen.getByText(STRENGTH)).toBeInTheDocument()
    expect(screen.getByText('Confirm password is required')).toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()
  })

  it('UI2 checklist ticks live; weak password blocks submit with the server message', async () => {
    const spy = mockApi({})
    renderApp('/register')
    const rules = screen.getByRole('list', { name: 'Password rules' })
    const met = () => rules.querySelectorAll('li[data-met="true"]').length
    const before = met()
    await typeInto('Password', 'a')
    const afterLower = met()
    expect(afterLower).toBeGreaterThan(before)
    await typeInto('Password', 'B1!cdefg')
    expect(met()).toBeGreaterThan(afterLower)
    await userEvent.clear(screen.getByLabelText('Password'))
    await fillRegister({ password: 'weakpass', confirm: 'weakpass' })
    await submitRegister()
    expect(screen.getByText(STRENGTH)).toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()
  })

  it('UI3 different confirm password shows the mismatch error without a call', async () => {
    const spy = mockApi({})
    renderApp('/register')
    await fillRegister({ confirm: 'Different1!' })
    await submitRegister()
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()
  })

  it('UI4 invalid username shows the username rule', async () => {
    const spy = mockApi({})
    renderApp('/register')
    await fillRegister({ username: '1abc' })
    await submitRegister()
    expect(
      screen.getByText("Username must be 3-30 characters, start with a letter, and use only letters, digits, '.', '_' or '-'"),
    ).toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()
  })

  it('UI5 409 appears at the username, values are kept, passwords cleared', async () => {
    mockApi({ 'POST /api/auth/register': apiError(409, 'Username is already taken') })
    renderApp('/register')
    await fillRegister()
    await submitRegister()
    expect(await screen.findByText('Username is already taken')).toBeInTheDocument()
    expect(screen.getByLabelText('Username')).toHaveValue('alice_01')
    expect(screen.getByLabelText('Name')).toHaveValue('Alice Smith')
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(screen.getByLabelText('Confirm password')).toHaveValue('')
  })

  it('UI5 400 fieldErrors are shown at the matching fields', async () => {
    mockApi({
      'POST /api/auth/register': apiError(400, 'Validation failed', [
        { field: 'password', message: 'Password must not contain the username' },
        { field: 'name', message: 'Name must be at most 100 characters' },
      ]),
    })
    renderApp('/register')
    await fillRegister()
    await submitRegister()
    expect(await screen.findByText('Password must not contain the username')).toBeInTheDocument()
    expect(screen.getByText('Name must be at most 100 characters')).toBeInTheDocument()
  })

  it('UI6 success goes to /login?registered=1 with a success banner and sends the exact body', async () => {
    const spy = mockApi({ 'POST /api/auth/register': json(alice, 201) })
    renderApp('/register')
    await fillRegister()
    await submitRegister()
    await waitFor(() => expect(where()).toBe('/login?registered=1'))
    expect(screen.getByRole('status')).toHaveTextContent(/registration successful/i)
    expect(bodyOf(spy, 'POST', '/api/auth/register')).toEqual({
      username: 'alice_01', name: 'Alice Smith', password: 'Str0ng!Pass', confirmPassword: 'Str0ng!Pass',
    })
  })
})

describe('QA Login UI7-UI9', () => {
  const doLogin = async () => {
    await typeInto('Username', 'alice_01')
    await typeInto('Password', 'Str0ng!Pass')
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
  }

  it('UI7 401 shows the credentials message and stays on /login', async () => {
    mockApi({ 'POST /api/auth/login': apiError(401, 'Invalid username or password') })
    renderApp('/login')
    await doLogin()
    expect(await screen.findByText('Invalid username or password')).toBeInTheDocument()
    expect(where()).toBe('/login')
  })

  it('UI7 403 shows the disabled-account text', async () => {
    mockApi({ 'POST /api/auth/login': apiError(403, 'Account is disabled') })
    renderApp('/login')
    await doLogin()
    expect(await screen.findByText('Your account is disabled. Contact the administrator.')).toBeInTheDocument()
  })

  it('UI8 USER login stores token, user, expiresAt and opens /tasks', async () => {
    mockApi({
      'POST /api/auth/login': json({ token: 'tok-user', tokenType: 'Bearer', expiresIn: 3600, user: alice }),
      'GET /api/tasks': json([]),
    })
    const before = Date.now()
    renderApp('/login')
    await doLogin()
    await waitFor(() => expect(where()).toBe('/tasks'))
    expect(localStorage.getItem(TOKEN_KEY)).toBe('tok-user')
    expect(JSON.parse(localStorage.getItem(USER_KEY)!)).toMatchObject({ username: 'alice_01', role: 'USER' })
    const expiresAt = Number(localStorage.getItem(EXPIRES_KEY))
    expect(expiresAt).toBeGreaterThanOrEqual(before + 3_599_000)
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 3_601_000)
  })

  it('UI8 ADMIN login opens /admin/users', async () => {
    mockApi({
      'POST /api/auth/login': json({ token: 'tok-admin', tokenType: 'Bearer', expiresIn: 3600, user: adminUser }),
      'GET /api/admin/users': json([]),
    })
    renderApp('/login')
    await typeInto('Username', 'admin')
    await typeInto('Password', 'admin')
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
    await waitFor(() => expect(where()).toBe('/admin/users'))
    expect(localStorage.getItem(TOKEN_KEY)).toBe('tok-admin')
  })

  it('UI9 submit button is disabled while the request is pending', async () => {
    const spy = mockApi({ 'POST /api/auth/login': () => new Promise<Response>(() => {}) })
    renderApp('/login')
    await doLogin()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Logging in…' })).toBeDisabled())
    expect(callsTo(spy, 'POST', '/api/auth/login')).toHaveLength(1)
  })

  it('banners: expired, disabled, passwordChanged', async () => {
    mockApi({})
    for (const [q, text] of [
      ['expired', /session has expired/i],
      ['disabled', /account is disabled/i],
      ['passwordChanged', /Your password was changed\. Please log in again\./],
    ] as const) {
      const { unmount } = renderApp(`/login?${q}=1`)
      expect(screen.getByText(text)).toBeInTheDocument()
      unmount()
    }
  })
})

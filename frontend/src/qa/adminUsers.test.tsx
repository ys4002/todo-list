import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { adminRow, adminUser, alice, apiError, bodyOf, callsTo, json, mockApi, renderApp, seedSession, urlsOf } from './qaUtils'

const bob = { ...alice, id: 3, username: 'bob_02', name: 'Bob Jones' }
const rows = () => [adminRow(adminUser, { taskCount: 0, openTaskCount: 0 }), adminRow(alice, { taskCount: 3, openTaskCount: 2 }), adminRow(bob, { enabled: false, taskCount: 1, openTaskCount: 1 })]
const rowOf = (username: string) => screen.getByText(username, { selector: 'td' }).closest('tr') as HTMLElement

describe('QA Admin users UI28-UI29, UI35', () => {
  it('UI28 lists users with status badges and task counts', async () => {
    seedSession('ADMIN')
    mockApi({ 'GET /api/admin/users': json(rows()) })
    renderApp('/admin/users')
    await screen.findByText('alice_01', { selector: 'td' })
    const alicRow = rowOf('alice_01')
    expect(within(alicRow).getByText('Enabled')).toBeInTheDocument()
    expect(alicRow).toHaveTextContent('3')
    expect(alicRow).toHaveTextContent('2')
    expect(within(rowOf('bob_02')).getByText('Disabled')).toBeInTheDocument()
    expect(within(alicRow).getByRole('link', { name: 'View tasks' })).toHaveAttribute('href', '/admin/users/2/tasks')
  })

  it('UI28 search sends q after the debounce', async () => {
    seedSession('ADMIN')
    const spy = mockApi({ 'GET /api/admin/users': json(rows()) })
    renderApp('/admin/users')
    await screen.findByText('alice_01', { selector: 'td' })
    const before = callsTo(spy, 'GET', '/api/admin/users').length
    await userEvent.type(screen.getByLabelText('Search users'), 'ali')
    expect(callsTo(spy, 'GET', '/api/admin/users')).toHaveLength(before)
    await waitFor(() => expect(callsTo(spy, 'GET', '/api/admin/users')).toHaveLength(before + 1), { timeout: 2000 })
    expect(urlsOf(spy, 'GET', '/api/admin/users').at(-1)).toContain('q=ali')
  })

  it('UI28 empty search result message', async () => {
    seedSession('ADMIN')
    mockApi({ 'GET /api/admin/users': (url) => json(url.includes('q=') ? [] : rows()) })
    renderApp('/admin/users')
    await screen.findByText('alice_01', { selector: 'td' })
    await userEvent.type(screen.getByLabelText('Search users'), 'zzz')
    expect(await screen.findByText('No users match your search')).toBeInTheDocument()
  })

  it('UI29 disable asks for confirmation, PATCHes {enabled:false} and updates the badge', async () => {
    seedSession('ADMIN')
    const spy = mockApi({
      'GET /api/admin/users': json(rows()),
      'PATCH /api/admin/users/2/status': json(adminRow(alice, { enabled: false })),
    })
    renderApp('/admin/users')
    await screen.findByText('alice_01', { selector: 'td' })
    await userEvent.click(screen.getByRole('button', { name: 'Disable alice_01' }))
    const dialog = screen.getByRole('dialog')
    expect(callsTo(spy, 'PATCH', '/api/admin/users/2/status')).toHaveLength(0)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Disable' }))
    await waitFor(() => expect(within(rowOf('alice_01')).getByText('Disabled')).toBeInTheDocument())
    expect(bodyOf(spy, 'PATCH', '/api/admin/users/2/status')).toEqual({ enabled: false })
    expect(screen.getByRole('button', { name: 'Enable alice_01' })).toBeInTheDocument()
  })

  it('UI29 cancelling the dialog makes no call', async () => {
    seedSession('ADMIN')
    const spy = mockApi({ 'GET /api/admin/users': json(rows()) })
    renderApp('/admin/users')
    await screen.findByText('alice_01', { selector: 'td' })
    await userEvent.click(screen.getByRole('button', { name: 'Disable alice_01' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    expect(callsTo(spy, 'PATCH', '/api/admin/users/2/status')).toHaveLength(0)
    expect(within(rowOf('alice_01')).getByText('Enabled')).toBeInTheDocument()
  })

  it('UI29 enable works and the admin\'s own Disable button is disabled with a tooltip', async () => {
    seedSession('ADMIN')
    const spy = mockApi({
      'GET /api/admin/users': json(rows()),
      'PATCH /api/admin/users/3/status': json(adminRow(bob, { enabled: true })),
    })
    renderApp('/admin/users')
    await screen.findByText('alice_01', { selector: 'td' })
    const own = screen.getByRole('button', { name: 'Disable admin' })
    expect(own).toBeDisabled()
    expect(own).toHaveAttribute('title', expect.stringMatching(/cannot disable your own/i))
    await userEvent.click(screen.getByRole('button', { name: 'Enable bob_02' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Enable' }))
    await waitFor(() => expect(within(rowOf('bob_02')).getByText('Enabled')).toBeInTheDocument())
    expect(bodyOf(spy, 'PATCH', '/api/admin/users/3/status')).toEqual({ enabled: true })
  })

  it('UI29 a 409 from the server is shown and the badge is unchanged', async () => {
    seedSession('ADMIN')
    mockApi({
      'GET /api/admin/users': json(rows()),
      'PATCH /api/admin/users/2/status': apiError(409, 'You cannot disable your own account'),
    })
    renderApp('/admin/users')
    await screen.findByText('alice_01', { selector: 'td' })
    await userEvent.click(screen.getByRole('button', { name: 'Disable alice_01' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Disable' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('You cannot disable your own account')
    expect(within(rowOf('alice_01')).getByText('Enabled')).toBeInTheDocument()
  })

  async function openReset(username: string) {
    await screen.findByText('alice_01', { selector: 'td' })
    await userEvent.click(screen.getByRole('button', { name: `Reset password for ${username}` }))
    return screen.getByRole('dialog')
  }
  const fill = async (dialog: HTMLElement, pw: string, confirm: string) => {
    await userEvent.type(within(dialog).getByLabelText('New password'), pw)
    await userEvent.type(within(dialog).getByLabelText('Confirm new password'), confirm)
  }
  const submit = (dialog: HTMLElement) => userEvent.click(within(dialog).getByRole('button', { name: 'Reset password' }))

  it('UI35 dialog names the target, checklist uses the target username, mismatch/weak block submit', async () => {
    seedSession('ADMIN')
    const spy = mockApi({ 'GET /api/admin/users': json(rows()) })
    renderApp('/admin/users')
    const dialog = await openReset('alice_01')
    expect(within(dialog).getByRole('heading')).toHaveTextContent('alice_01')
    const rules = within(dialog).getByRole('list', { name: 'Password rules' })
    await userEvent.type(within(dialog).getByLabelText('New password'), 'xalice_01')
    const usernameRule = within(rules).getByText(/does not contain the username/i).closest('li')!
    expect(usernameRule).toHaveAttribute('data-met', 'false')
    await userEvent.clear(within(dialog).getByLabelText('New password'))
    await fill(dialog, 'weak', 'weak')
    await submit(dialog)
    expect(within(dialog).getAllByRole('alert').length).toBeGreaterThan(0)
    await userEvent.clear(within(dialog).getByLabelText('New password'))
    await userEvent.clear(within(dialog).getByLabelText('Confirm new password'))
    await fill(dialog, 'N3w#Secret', 'N3w#Other')
    await submit(dialog)
    expect(within(dialog).getByText('Passwords do not match')).toBeInTheDocument()
    expect(callsTo(spy, 'PUT', '/api/admin/users/2/password')).toHaveLength(0)
  })

  it('UI35 valid reset sends PUT {newPassword, confirmNewPassword} and shows the notice', async () => {
    seedSession('ADMIN')
    const spy = mockApi({
      'GET /api/admin/users': json(rows()),
      'PUT /api/admin/users/2/password': json(adminRow(alice)),
    })
    renderApp('/admin/users')
    const dialog = await openReset('alice_01')
    await fill(dialog, 'N3w#Secret', 'N3w#Secret')
    await submit(dialog)
    expect(await screen.findByText('Password updated for alice_01')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(bodyOf(spy, 'PUT', '/api/admin/users/2/password')).toEqual({ newPassword: 'N3w#Secret', confirmNewPassword: 'N3w#Secret' })
  })

  it('UI35 works on the admin\'s own row', async () => {
    seedSession('ADMIN')
    const spy = mockApi({
      'GET /api/admin/users': json(rows()),
      'PUT /api/admin/users/1/password': json(adminRow(adminUser)),
    })
    renderApp('/admin/users')
    const dialog = await openReset('admin')
    expect(within(dialog).getByRole('heading')).toHaveTextContent('admin')
    await fill(dialog, 'N3w#Secret', 'N3w#Secret')
    await submit(dialog)
    expect(await screen.findByText('Password updated for admin')).toBeInTheDocument()
    expect(callsTo(spy, 'PUT', '/api/admin/users/1/password')).toHaveLength(1)
  })

  it('UI35 server 400 is shown in the dialog and the dialog stays open', async () => {
    seedSession('ADMIN')
    mockApi({
      'GET /api/admin/users': json(rows()),
      'PUT /api/admin/users/2/password': apiError(400, 'Validation failed', [
        { field: 'newPassword', message: 'Password must not contain the username' },
      ]),
    })
    renderApp('/admin/users')
    const dialog = await openReset('alice_01')
    await fill(dialog, 'N3w#Secret', 'N3w#Secret')
    await submit(dialog)
    expect(await within(dialog).findByText('Password must not contain the username')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('UI35 Cancel makes no call', async () => {
    seedSession('ADMIN')
    const spy = mockApi({ 'GET /api/admin/users': json(rows()) })
    renderApp('/admin/users')
    const dialog = await openReset('alice_01')
    await fill(dialog, 'N3w#Secret', 'N3w#Secret')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(callsTo(spy, 'PUT', '/api/admin/users/2/password')).toHaveLength(0)
  })
})

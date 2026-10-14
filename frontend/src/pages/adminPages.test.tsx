import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { AdminUser } from '../api/types'
import { toDateTimeLocalValue, toIsoUtc } from '../utils/dateUtils'
import {
  errorResponse, fetchCalls, hoursFromNow, jsonResponse, lastBody, makeTask, makeUser, mockApi, renderApp, seedSession, where,
} from '../test/testUtils'

const adminUser = (overrides: Partial<AdminUser> = {}): AdminUser => ({
  ...makeUser('USER'), enabled: true, taskCount: 3, openTaskCount: 2, ...overrides,
})
const self = adminUser({ id: 1, username: 'admin', name: 'Administrator', role: 'ADMIN', taskCount: 0, openTaskCount: 0 })
const alice = adminUser({ id: 2 })
const bob = adminUser({ id: 3, username: 'bob_02', name: 'Bob', enabled: false, taskCount: 1, openTaskCount: 1 })

const rowOf = (username: string) => screen.getByRole('row', { name: new RegExp(username) })

describe('admin users (UI28-UI29)', () => {
  it('UI28: lists users with badges and counts; search sends q after 300 ms', async () => {
    const spy = mockApi({ 'GET /api/admin/users': jsonResponse([self, alice, bob]) })
    seedSession('ADMIN')
    renderApp('/admin/users')
    expect(await screen.findByText('alice_01')).toBeInTheDocument()
    expect(within(rowOf('alice_01')).getByText('Enabled')).toBeInTheDocument()
    expect(within(rowOf('bob_02')).getByText('Disabled')).toBeInTheDocument()
    expect(within(rowOf('alice_01')).getByText('3 total, 2 open')).toBeInTheDocument()
    expect(within(rowOf('alice_01')).getByRole('link', { name: 'View tasks' })).toHaveAttribute('href', '/admin/users/2/tasks')

    await userEvent.type(screen.getByLabelText('Search users'), 'ali')
    expect(fetchCalls(spy, 'GET', '/api/admin/users')).toHaveLength(1)
    await waitFor(() => expect(fetchCalls(spy, 'GET', '/api/admin/users')).toHaveLength(2))
    expect(String(fetchCalls(spy, 'GET', '/api/admin/users')[1][0])).toBe('/api/admin/users?q=ali')
  })

  it('UI29: disable with confirm updates the badge; own row is disabled; 409 is shown', async () => {
    const spy = mockApi({
      'GET /api/admin/users': jsonResponse([self, alice]),
      'PATCH /api/admin/users/2/status': jsonResponse({ ...alice, enabled: false }),
    })
    seedSession('ADMIN')
    renderApp('/admin/users')
    await screen.findByText('alice_01')
    const ownButton = within(rowOf('admin')).getByRole('button', { name: 'Disable admin' })
    expect(ownButton).toBeDisabled()
    expect(ownButton).toHaveAttribute('title', 'You cannot disable your own account')

    await userEvent.click(within(rowOf('alice_01')).getByRole('button', { name: 'Disable alice_01' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    expect(fetchCalls(spy, 'PATCH', '/api/admin/users/2/status')).toHaveLength(0)

    await userEvent.click(within(rowOf('alice_01')).getByRole('button', { name: 'Disable alice_01' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Disable' }))
    await waitFor(() => expect(within(rowOf('alice_01')).getByText('Disabled')).toBeInTheDocument())
    expect(lastBody(spy, 'PATCH', '/api/admin/users/2/status')).toEqual({ enabled: false })
    expect(within(rowOf('alice_01')).getByRole('button', { name: 'Enable alice_01' })).toBeInTheDocument()
  })

  it('UI29: shows a 409 message from the server', async () => {
    mockApi({
      'GET /api/admin/users': jsonResponse([self, alice]),
      'PATCH /api/admin/users/2/status': errorResponse(409, 'You cannot disable your own account'),
    })
    seedSession('ADMIN')
    renderApp('/admin/users')
    await screen.findByText('alice_01')
    await userEvent.click(within(rowOf('alice_01')).getByRole('button', { name: 'Disable alice_01' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Disable' }))
    expect(await screen.findByText('You cannot disable your own account')).toBeInTheDocument()
  })
})

describe('reset password (UI35)', () => {
  const open = async (username: string) => {
    seedSession('ADMIN')
    renderApp('/admin/users')
    await screen.findByText('alice_01')
    await userEvent.click(within(rowOf(username)).getByRole('button', { name: `Reset password for ${username}` }))
    return screen.getByRole('dialog')
  }
  const fill = async (dialog: HTMLElement, pw: string, confirm: string) => {
    await userEvent.type(within(dialog).getByLabelText('New password'), pw)
    await userEvent.type(within(dialog).getByLabelText('Confirm new password'), confirm)
  }
  const submit = (dialog: HTMLElement) => userEvent.click(within(dialog).getByRole('button', { name: 'Reset password' }))

  it('shows the target username, blocks weak/mismatched input, and Cancel makes no call', async () => {
    const spy = mockApi({ 'GET /api/admin/users': jsonResponse([self, alice]) })
    const dialog = await open('alice_01')
    expect(within(dialog).getByRole('heading', { name: 'Reset password for alice_01' })).toBeInTheDocument()
    await fill(dialog, 'weak', 'other')
    await submit(dialog)
    expect(within(dialog).getByText(/^Password must be 8-64 characters/)).toBeInTheDocument()
    expect(within(dialog).getByText('Passwords do not match')).toBeInTheDocument()
    await userEvent.clear(within(dialog).getByLabelText('New password'))
    await userEvent.type(within(dialog).getByLabelText('New password'), 'xALICE_01!9')
    expect(within(dialog).getByRole('list', { name: 'Password rules' }).querySelector('[data-met="false"]')?.textContent).toContain('username')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fetchCalls(spy, 'PUT', '/api/admin/users/2/password')).toHaveLength(0)
  })

  it('valid input PUTs and shows the success notice', async () => {
    const spy = mockApi({
      'GET /api/admin/users': jsonResponse([self, alice]),
      'PUT /api/admin/users/2/password': jsonResponse(alice),
    })
    const dialog = await open('alice_01')
    await fill(dialog, 'N3w#Secret', 'N3w#Secret')
    await submit(dialog)
    expect(await screen.findByText('Password updated for alice_01')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(lastBody(spy, 'PUT', '/api/admin/users/2/password')).toEqual({
      newPassword: 'N3w#Secret', confirmNewPassword: 'N3w#Secret',
    })
  })

  it('works on the admin\'s own row and keeps the renewed token', async () => {
    mockApi({
      'GET /api/admin/users': jsonResponse([self, alice]),
      'PUT /api/admin/users/1/password': jsonResponse(self, 200, { 'X-Auth-Token': 'fresh', 'X-Auth-Expires-In': '3600' }),
    })
    const dialog = await open('admin')
    await fill(dialog, 'N3w#Secret', 'N3w#Secret')
    await submit(dialog)
    expect(await screen.findByText('Password updated for admin')).toBeInTheDocument()
    expect(localStorage.getItem('todo_app_token')).toBe('fresh')
  })

  it('shows a server 400 inside the dialog', async () => {
    mockApi({
      'GET /api/admin/users': jsonResponse([self, alice]),
      'PUT /api/admin/users/2/password': errorResponse(400, 'Validation failed', [
        { field: 'newPassword', message: 'Password must not contain the username' },
      ]),
    })
    const dialog = await open('alice_01')
    await fill(dialog, 'N3w#Secret', 'N3w#Secret')
    await submit(dialog)
    expect(await within(screen.getByRole('dialog')).findByText('Password must not contain the username')).toBeInTheDocument()
  })
})

describe('admin user tasks (UI30)', () => {
  it('shows the heading and uses the admin task endpoints for every operation', async () => {
    const task = makeTask({ id: 5, title: 'Water plants', dueAt: hoursFromNow(5) })
    const created = makeTask({ id: 6, title: 'New one' })
    const spy = mockApi({
      'GET /api/admin/users/2': jsonResponse(alice),
      'GET /api/admin/users/2/tasks': jsonResponse([task]),
      'POST /api/admin/users/2/tasks': jsonResponse(created, 201),
      'PUT /api/admin/users/2/tasks/5': jsonResponse({ ...task, title: 'Water more' }),
      'PATCH /api/admin/users/2/tasks/5/completion': jsonResponse({ ...task, completed: true }),
      'DELETE /api/admin/users/2/tasks/5': jsonResponse(null, 204),
    })
    seedSession('ADMIN')
    renderApp('/admin/users/2/tasks')
    expect(await screen.findByRole('heading', { name: /Tasks of alice_01/ })).toBeInTheDocument()
    expect(await screen.findByText('Water plants')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Back to users/ })).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Search tasks'), 'water')
    await waitFor(() => expect(String(fetchCalls(spy, 'GET', '/api/admin/users/2/tasks').at(-1)![0])).toBe('/api/admin/users/2/tasks?q=water'))

    await userEvent.click(screen.getByLabelText("Mark 'Water plants' as completed"))
    expect(fetchCalls(spy, 'PATCH', '/api/admin/users/2/tasks/5/completion')).toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: "Save completion change for 'Water plants'" }))
    await waitFor(() => expect(fetchCalls(spy, 'PATCH', '/api/admin/users/2/tasks/5/completion')).toHaveLength(1))

    await userEvent.click(screen.getByRole('button', { name: "Edit 'Water plants'" }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(fetchCalls(spy, 'PUT', '/api/admin/users/2/tasks/5')).toHaveLength(1))

    await userEvent.click(screen.getByRole('button', { name: 'Add task' }))
    const due = toDateTimeLocalValue(hoursFromNow(30))
    await userEvent.type(screen.getByLabelText('Title'), 'New one')
    fireEvent.change(screen.getByLabelText('Due date and time'), { target: { value: due } })
    await userEvent.click(screen.getByRole('button', { name: 'Add task', description: '' }))
    await waitFor(() => expect(fetchCalls(spy, 'POST', '/api/admin/users/2/tasks')).toHaveLength(1))
    expect(lastBody(spy, 'POST', '/api/admin/users/2/tasks').dueAt).toBe(toIsoUtc(due))

    await userEvent.click(screen.getByRole('button', { name: "Delete 'Water more'" }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(fetchCalls(spy, 'DELETE', '/api/admin/users/2/tasks/5')).toHaveLength(1))
  })

  it('View tasks link opens the task page of that user', async () => {
    mockApi({ 'GET /api/admin/users': jsonResponse([self, alice]), 'GET /api/admin/users/2': jsonResponse(alice), 'GET /api/admin/users/2/tasks': jsonResponse([]) })
    seedSession('ADMIN')
    renderApp('/admin/users')
    await screen.findByText('alice_01')
    await userEvent.click(within(rowOf('alice_01')).getByRole('link', { name: 'View tasks' }))
    expect(where()).toBe('/admin/users/2/tasks')
    expect(await screen.findByRole('heading', { name: /Tasks of alice_01/ })).toBeInTheDocument()
  })
})

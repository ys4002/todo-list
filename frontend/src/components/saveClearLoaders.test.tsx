import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { AdminUser } from '../api/types'
import {
  errorResponse, fetchCalls, hoursFromNow, jsonResponse, makeTask, makeUser, mockApi, renderApp, seedSession,
} from '../test/testUtils'
import { toDateTimeLocalValue } from '../utils/dateUtils'
import Spinner from './Spinner'

/** A promise-backed response the test releases by hand. */
function deferred() {
  let release: (r: Response) => void = () => {}
  const promise = new Promise<Response>((resolve) => (release = resolve))
  return { promise, release: (r: Response) => release(r) }
}

const saveName = (title: string) => `Save completion change for '${title}'`
const clearName = (title: string) => `Discard completion change for '${title}'`
const checkbox = (title: string) => screen.getByRole('checkbox', { name: `Mark '${title}' as completed` })
const saveButton = (title: string) => screen.getByRole('button', { name: saveName(title) })
const clearButton = (title: string) => screen.getByRole('button', { name: clearName(title) })
const noSaveButton = (title: string) => expect(screen.queryByRole('button', { name: saveName(title) })).not.toBeInTheDocument()
const patchPath = (id: number) => `/api/tasks/${id}/completion`

async function openTasks(spy: ReturnType<typeof mockApi>) {
  seedSession('USER')
  renderApp('/tasks')
  await waitFor(() => expect(fetchCalls(spy, 'GET', '/api/tasks').length).toBeGreaterThan(0))
}

describe('Spinner (T15)', () => {
  it('is hidden from assistive tech without a label', () => {
    const { container } = render(<Spinner />)
    expect(container.querySelector('.spinner')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('adds a polite status with a label', () => {
    render(<Spinner label="Updating tasks…" size="md" />)
    expect(screen.getByRole('status')).toHaveTextContent('Updating tasks…')
    expect(document.querySelector('.spinner')).toHaveClass('spinner-md')
  })
})

describe('Save and Clear for completion (T1-T10)', () => {
  it('T1: ticking makes no request and shows Save, Clear and an "Unsaved change" description', async () => {
    const spy = mockApi({ 'GET /api/tasks': jsonResponse([makeTask({ id: 1, title: 'Pay rent' })]) })
    await openTasks(spy)
    noSaveButton('Pay rent')
    await userEvent.click(await screen.findByRole('checkbox', { name: "Mark 'Pay rent' as completed" }))
    expect(checkbox('Pay rent')).toBeChecked()
    expect(saveButton('Pay rent')).toBeEnabled()
    expect(clearButton('Pay rent')).toBeEnabled()
    expect(checkbox('Pay rent')).toHaveAccessibleDescription('Unsaved change')
    expect(fetchCalls(spy, 'PATCH', patchPath(1))).toHaveLength(0)
  })

  it('T2: Save sends one PATCH, updates the row, announces it and focuses the checkbox', async () => {
    const task = makeTask({ id: 2, title: 'Water plants' })
    const spy = mockApi({
      'GET /api/tasks': jsonResponse([task]),
      'PATCH /api/tasks/2/completion': jsonResponse({ ...task, completed: true }),
    })
    await openTasks(spy)
    await userEvent.click(await screen.findByRole('checkbox', { name: "Mark 'Water plants' as completed" }))
    await userEvent.click(saveButton('Water plants'))
    await waitFor(() => noSaveButton('Water plants'))
    expect(fetchCalls(spy, 'PATCH', patchPath(2))).toHaveLength(1)
    expect(JSON.parse(String(fetchCalls(spy, 'PATCH', patchPath(2))[0][1]?.body))).toEqual({ completed: true })
    expect(checkbox('Water plants')).toBeChecked()
    expect(screen.getByRole('listitem')).toHaveClass('completed')
    expect(screen.queryByText('Unsaved change')).not.toBeInTheDocument()
    expect(screen.getByText("'Water plants' marked as completed")).toHaveAttribute('aria-live', 'polite')
    await waitFor(() => expect(checkbox('Water plants')).toHaveFocus())
  })

  it('T2: a saved task that leaves the filter moves focus to the list', async () => {
    const task = makeTask({ id: 3, title: 'Leaving' })
    const spy = mockApi({
      'GET /api/tasks': jsonResponse([task]), // the mock ignores the filter, as a server that has not seen the save yet
      'PATCH /api/tasks/3/completion': jsonResponse({ ...task, completed: true }),
    })
    await openTasks(spy)
    await userEvent.click(screen.getByRole('tab', { name: 'Active' }))
    await userEvent.click(await screen.findByRole('checkbox', { name: "Mark 'Leaving' as completed" }))
    await userEvent.click(saveButton('Leaving'))
    await waitFor(() => expect(screen.queryByText('Leaving')).not.toBeInTheDocument())
    expect(screen.getByRole('group', { name: 'Tasks' })).toHaveFocus()
    expect(screen.getByText("'Leaving' marked as completed")).toBeInTheDocument()
  })

  it('T2: admin scope saves through the admin endpoint', async () => {
    const task = makeTask({ id: 5, title: 'Admin saves' })
    const spy = mockApi({
      'GET /api/admin/users/2': jsonResponse({ ...makeUser('USER'), enabled: true, taskCount: 1, openTaskCount: 1 }),
      'GET /api/admin/users/2/tasks': jsonResponse([task]),
      'PATCH /api/admin/users/2/tasks/5/completion': jsonResponse({ ...task, completed: true }),
    })
    seedSession('ADMIN')
    renderApp('/admin/users/2/tasks')
    await userEvent.click(await screen.findByRole('checkbox', { name: "Mark 'Admin saves' as completed" }))
    expect(fetchCalls(spy, 'PATCH', '/api/admin/users/2/tasks/5/completion')).toHaveLength(0)
    await userEvent.click(saveButton('Admin saves'))
    await waitFor(() => expect(fetchCalls(spy, 'PATCH', '/api/admin/users/2/tasks/5/completion')).toHaveLength(1))
    expect(fetchCalls(spy, 'PATCH', patchPath(5))).toHaveLength(0)
  })

  it('T3: Clear restores the saved state with no request and focuses the checkbox', async () => {
    const spy = mockApi({ 'GET /api/tasks': jsonResponse([makeTask({ id: 4, title: 'Undo me' })]) })
    await openTasks(spy)
    await userEvent.click(await screen.findByRole('checkbox', { name: "Mark 'Undo me' as completed" }))
    await userEvent.click(clearButton('Undo me'))
    expect(checkbox('Undo me')).not.toBeChecked()
    noSaveButton('Undo me')
    expect(fetchCalls(spy, 'PATCH', patchPath(4))).toHaveLength(0)
    expect(screen.getByText("Change discarded for 'Undo me'")).toBeInTheDocument()
    await waitFor(() => expect(checkbox('Undo me')).toHaveFocus())
  })

  it('T4: toggling back to the saved value removes the staged change', async () => {
    const spy = mockApi({ 'GET /api/tasks': jsonResponse([makeTask({ id: 6, title: 'Flip flop' })]) })
    await openTasks(spy)
    await userEvent.click(await screen.findByRole('checkbox', { name: "Mark 'Flip flop' as completed" }))
    await userEvent.click(checkbox('Flip flop'))
    noSaveButton('Flip flop')
    expect(screen.queryByText('Unsaved change')).not.toBeInTheDocument()
  })

  it('T5: saving one staged task leaves the other staged', async () => {
    const a = makeTask({ id: 7, title: 'First' })
    const b = makeTask({ id: 8, title: 'Second' })
    const spy = mockApi({
      'GET /api/tasks': jsonResponse([a, b]),
      'PATCH /api/tasks/7/completion': jsonResponse({ ...a, completed: true }),
    })
    await openTasks(spy)
    await userEvent.click(await screen.findByRole('checkbox', { name: "Mark 'First' as completed" }))
    await userEvent.click(checkbox('Second'))
    await userEvent.click(saveButton('First'))
    await waitFor(() => noSaveButton('First'))
    expect(saveButton('Second')).toBeEnabled()
    expect(checkbox('Second')).toBeChecked()
  })

  it('T6: a failed Save keeps the change staged, shows a toast and a row error, and Save works again', async () => {
    const task = makeTask({ id: 9, title: 'Flaky' })
    let attempts = 0
    const spy = mockApi({
      'GET /api/tasks': jsonResponse([task]),
      'PATCH /api/tasks/9/completion': () =>
        ++attempts === 1 ? errorResponse(500, 'Unexpected error') : jsonResponse({ ...task, completed: true }),
    })
    await openTasks(spy)
    await userEvent.click(await screen.findByRole('checkbox', { name: "Mark 'Flaky' as completed" }))
    await userEvent.click(saveButton('Flaky'))
    expect(await screen.findByText('Unexpected error')).toBeInTheDocument()
    expect(screen.getByText('Not saved. Try again.')).toBeInTheDocument()
    expect(checkbox('Flaky')).toBeChecked()
    expect(saveButton('Flaky')).toBeEnabled()
    await userEvent.click(saveButton('Flaky'))
    await waitFor(() => noSaveButton('Flaky'))
    expect(screen.queryByText('Not saved. Try again.')).not.toBeInTheDocument()
    expect(fetchCalls(spy, 'PATCH', patchPath(9))).toHaveLength(2)
  })

  it('T6: a 404 on Save drops the task and its staged change', async () => {
    const spy = mockApi({
      'GET /api/tasks': jsonResponse([makeTask({ id: 10, title: 'Gone' })]),
      'PATCH /api/tasks/10/completion': errorResponse(404, 'Task not found'),
    })
    await openTasks(spy)
    await userEvent.click(await screen.findByRole('checkbox', { name: "Mark 'Gone' as completed" }))
    await userEvent.click(saveButton('Gone'))
    await waitFor(() => expect(screen.queryByText('Gone')).not.toBeInTheDocument())
  })

  it('T7: while saving the row shows a spinner and "Saving…", is locked and busy, and sends one request', async () => {
    const task = makeTask({ id: 11, title: 'Slow' })
    const pending = deferred()
    const spy = mockApi({
      'GET /api/tasks': jsonResponse([task]),
      'PATCH /api/tasks/11/completion': () => pending.promise,
    })
    await openTasks(spy)
    await userEvent.click(await screen.findByRole('checkbox', { name: "Mark 'Slow' as completed" }))
    await userEvent.click(saveButton('Slow'))
    const saving = saveButton('Slow')
    expect(saving).toHaveTextContent('Saving…')
    expect(saving).toBeDisabled()
    expect(saving).toHaveAttribute('aria-busy', 'true')
    expect(saving.querySelector('.spinner')).toBeInTheDocument()
    expect(checkbox('Slow')).toBeDisabled()
    expect(clearButton('Slow')).toBeDisabled()
    expect(screen.getByRole('button', { name: "Edit 'Slow'" })).toBeDisabled()
    expect(screen.getByRole('button', { name: "Delete 'Slow'" })).toBeDisabled()
    expect(screen.getByRole('listitem')).toHaveAttribute('aria-busy', 'true')
    await userEvent.click(saving)
    expect(fetchCalls(spy, 'PATCH', patchPath(11))).toHaveLength(1)
    pending.release(jsonResponse({ ...task, completed: true }))
    await waitFor(() => noSaveButton('Slow'))
    expect(screen.getByRole('listitem')).not.toHaveAttribute('aria-busy')
  })

  it('T8: a staged change reappears when the task is listed again after a tab change', async () => {
    const task = makeTask({ id: 12, title: 'Sticky' })
    const spy = mockApi({
      'GET /api/tasks': (url) => jsonResponse(url.includes('status=completed') ? [] : [task]),
    })
    await openTasks(spy)
    await userEvent.click(await screen.findByRole('checkbox', { name: "Mark 'Sticky' as completed" }))
    await userEvent.click(screen.getByRole('tab', { name: 'Completed' }))
    expect(await screen.findByText('No tasks yet')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'All' }))
    expect(await screen.findByText('Sticky')).toBeInTheDocument()
    expect(checkbox('Sticky')).toBeChecked()
    expect(saveButton('Sticky')).toBeEnabled()
    expect(fetchCalls(spy, 'PATCH', patchPath(12))).toHaveLength(0)
  })

  it('T9: the edit form starts from the staged value, locks the row, and a form save clears the staged change', async () => {
    const task = makeTask({ id: 13, title: 'Editable', dueAt: hoursFromNow(48) })
    const spy = mockApi({
      'GET /api/tasks': jsonResponse([task]),
      'PUT /api/tasks/13': jsonResponse({ ...task, completed: true }),
    })
    await openTasks(spy)
    await userEvent.click(await screen.findByRole('checkbox', { name: "Mark 'Editable' as completed" }))
    await userEvent.click(screen.getByRole('button', { name: "Edit 'Editable'" }))
    expect(screen.getByLabelText('Completed')).toBeChecked()
    expect(checkbox('Editable')).toBeDisabled()
    expect(saveButton('Editable')).toBeDisabled()
    expect(clearButton('Editable')).toBeDisabled()
    expect(screen.getByRole('button', { name: "Delete 'Editable'" })).toBeDisabled()
    expect(screen.getByRole('button', { name: "Edit 'Editable'" })).toHaveTextContent('Editing')
    await userEvent.click(within(screen.getByRole('form', { name: 'Edit task' })).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByRole('form', { name: 'Edit task' })).not.toBeInTheDocument())
    noSaveButton('Editable')
    expect(checkbox('Editable')).toBeChecked()
    expect(checkbox('Editable')).toBeEnabled()
  })

  it('T9: Cancel keeps the staged change', async () => {
    const spy = mockApi({ 'GET /api/tasks': jsonResponse([makeTask({ id: 14, title: 'Keep staged' })]) })
    await openTasks(spy)
    await userEvent.click(await screen.findByRole('checkbox', { name: "Mark 'Keep staged' as completed" }))
    await userEvent.click(screen.getByRole('button', { name: "Edit 'Keep staged'" }))
    await userEvent.click(within(screen.getByRole('form', { name: 'Edit task' })).getByRole('button', { name: 'Cancel' }))
    expect(saveButton('Keep staged')).toBeEnabled()
    expect(checkbox('Keep staged')).toBeChecked()
  })

  it('T10: Delete makes the row busy until it finishes, then the row and its staged change are gone', async () => {
    const task = makeTask({ id: 15, title: 'Doomed' })
    const pending = deferred()
    const spy = mockApi({
      'GET /api/tasks': jsonResponse([task]),
      'DELETE /api/tasks/15': () => pending.promise,
    })
    await openTasks(spy)
    await userEvent.click(await screen.findByRole('checkbox', { name: "Mark 'Doomed' as completed" }))
    await userEvent.click(screen.getByRole('button', { name: "Delete 'Doomed'" }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    const deleting = screen.getByRole('button', { name: "Delete 'Doomed'" })
    expect(deleting).toHaveTextContent('Deleting…')
    expect(deleting).toBeDisabled()
    expect(deleting.querySelector('.spinner')).toBeInTheDocument()
    expect(screen.getByRole('listitem')).toHaveAttribute('aria-busy', 'true')
    expect(checkbox('Doomed')).toBeDisabled()
    expect(saveButton('Doomed')).toBeDisabled()
    await userEvent.click(deleting)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fetchCalls(spy, 'DELETE', '/api/tasks/15')).toHaveLength(1)
    pending.release(jsonResponse(null, 204))
    await waitFor(() => expect(screen.queryByText('Doomed')).not.toBeInTheDocument())
  })

  it('T10: a failed Delete unlocks the row and keeps the staged change', async () => {
    const spy = mockApi({
      'GET /api/tasks': jsonResponse([makeTask({ id: 16, title: 'Survivor' })]),
      'DELETE /api/tasks/16': errorResponse(500, 'Unexpected error'),
    })
    await openTasks(spy)
    await userEvent.click(await screen.findByRole('checkbox', { name: "Mark 'Survivor' as completed" }))
    await userEvent.click(screen.getByRole('button', { name: "Delete 'Survivor'" }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText('Unexpected error')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: "Delete 'Survivor'" })).toBeEnabled())
    expect(saveButton('Survivor')).toBeEnabled()
  })
})

describe('list updating, B1/B2 (T11-T12)', () => {
  it('T11 (B2): a list response that started before a create finished does not remove the created task', async () => {
    const created = makeTask({ id: 21, title: 'Buy milk' })
    const stale = deferred()
    let listCalls = 0
    const spy = mockApi({
      'GET /api/tasks': () => {
        listCalls += 1
        if (listCalls === 1) return jsonResponse([])
        if (listCalls === 2) return stale.promise
        return jsonResponse([created])
      },
      'POST /api/tasks': jsonResponse(created, 201),
    })
    await openTasks(spy)
    await screen.findByText('No tasks yet')
    await userEvent.click(screen.getByRole('tab', { name: 'Active' })) // list request 2 stays pending
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }))
    await userEvent.type(screen.getByLabelText('Title'), 'Buy milk')
    fireEvent.change(screen.getByLabelText('Due date and time'), { target: { value: toDateTimeLocalValue(hoursFromNow(24)) } })
    await userEvent.click(screen.getByRole('button', { name: 'Add task', description: '' }))
    expect(await screen.findByText('Buy milk')).toBeInTheDocument()
    stale.release(jsonResponse([])) // answers with data from before the create
    await waitFor(() => expect(listCalls).toBe(3)) // ignored, then refetched
    expect(await screen.findByText('Buy milk')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Updating tasks…')).not.toBeInTheDocument())
  })

  it('T12 (B1): the search box shows an "Updating tasks…" spinner during the debounce and the request', async () => {
    const pending = deferred()
    let listCalls = 0
    const spy = mockApi({
      'GET /api/tasks': () => (++listCalls === 2 ? pending.promise : jsonResponse([makeTask({ id: 30, title: 'Milk run' })])),
    })
    await openTasks(spy)
    await screen.findByText('Milk run')
    expect(screen.queryByText('Updating tasks…')).not.toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Search tasks'), 'milk')
    expect(screen.getByText('Updating tasks…')).toHaveAttribute('role', 'status') // debounce pending
    expect(fetchCalls(spy, 'GET', '/api/tasks')).toHaveLength(1)
    await waitFor(() => expect(listCalls).toBe(2)) // request in flight
    expect(screen.getByText('Updating tasks…')).toBeInTheDocument()
    const region = screen.getByRole('group', { name: 'Tasks' })
    expect(region).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText('Milk run')).toBeInTheDocument() // old data stays visible
    pending.release(jsonResponse([makeTask({ id: 30, title: 'Milk run' })]))
    await waitFor(() => expect(screen.queryByText('Updating tasks…')).not.toBeInTheDocument())
    expect(region).toHaveAttribute('aria-busy', 'false')
  })

  it('T12 (B1): a tab change shows the same spinner while the old list stays visible', async () => {
    const pending = deferred()
    let listCalls = 0
    const spy = mockApi({
      'GET /api/tasks': () => (++listCalls === 2 ? pending.promise : jsonResponse([makeTask({ id: 31, title: 'Old row' })])),
    })
    await openTasks(spy)
    await screen.findByText('Old row')
    await userEvent.click(screen.getByRole('tab', { name: 'Completed' }))
    expect(screen.getByText('Updating tasks…')).toBeInTheDocument()
    expect(screen.getByText('Old row')).toBeInTheDocument()
    pending.release(jsonResponse([]))
    expect(await screen.findByText('No tasks yet')).toBeInTheDocument()
    expect(screen.queryByText('Updating tasks…')).not.toBeInTheDocument()
  })

  it('shows an error banner and no list when the first load fails', async () => {
    mockApi({ 'GET /api/tasks': errorResponse(500, 'Unexpected error') })
    seedSession('USER')
    renderApp('/tasks')
    expect(await screen.findByRole('alert')).toHaveTextContent('Unexpected error')
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
  })
})

describe('buttons with a loader (T13)', () => {
  it('T13: Register shows the spinner and "Registering…" and is disabled while pending', async () => {
    const pending = deferred()
    const spy = mockApi({ 'POST /api/auth/register': () => pending.promise })
    renderApp('/register')
    await userEvent.type(screen.getByLabelText('Username'), 'alice_01')
    await userEvent.type(screen.getByLabelText('Name'), 'Alice Smith')
    await userEvent.type(screen.getByLabelText('Password'), 'Str0ng!Pass')
    await userEvent.type(screen.getByLabelText('Confirm password'), 'Str0ng!Pass')
    await userEvent.click(screen.getByRole('button', { name: 'Register' }))
    const button = screen.getByRole('button', { name: 'Registering…' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button.querySelector('.spinner')).toBeInTheDocument()
    await userEvent.click(button)
    expect(fetchCalls(spy, 'POST', '/api/auth/register')).toHaveLength(1)
  })

  it('T13: Login shows the spinner and keeps the fields editable', async () => {
    const pending = deferred()
    mockApi({ 'POST /api/auth/login': () => pending.promise })
    renderApp('/login')
    await userEvent.type(screen.getByLabelText('Username'), 'alice_01')
    await userEvent.type(screen.getByLabelText('Password'), 'Str0ng!Pass')
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
    const button = screen.getByRole('button', { name: 'Logging in…' })
    expect(button.querySelector('.spinner')).toBeInTheDocument()
    expect(screen.getByLabelText('Username')).toBeEnabled()
  })

  it('T13: Change password shows "Changing…" and is disabled while pending', async () => {
    const pending = deferred()
    const spy = mockApi({ 'PUT /api/auth/password': () => pending.promise })
    seedSession('USER')
    renderApp('/profile')
    await userEvent.type(await screen.findByLabelText('Current password'), 'Str0ng!Pass')
    await userEvent.type(screen.getByLabelText('New password'), 'N3w#Secret')
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'N3w#Secret')
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }))
    const button = screen.getByRole('button', { name: 'Changing…' })
    expect(button).toBeDisabled()
    expect(button.querySelector('.spinner')).toBeInTheDocument()
    await userEvent.click(button)
    expect(spy.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(1)
  })

  it('T13: the task form submit shows the spinner and Cancel is disabled while saving (B6a)', async () => {
    const pending = deferred()
    const spy = mockApi({
      'GET /api/tasks': jsonResponse([]),
      'POST /api/tasks': () => pending.promise,
    })
    await openTasks(spy)
    await userEvent.click(await screen.findByRole('button', { name: 'Add task' }))
    await userEvent.type(screen.getByLabelText('Title'), 'Buy milk')
    fireEvent.change(screen.getByLabelText('Due date and time'), { target: { value: toDateTimeLocalValue(hoursFromNow(24)) } })
    await userEvent.click(screen.getByRole('button', { name: 'Add task', description: '' }))
    const form = screen.getByRole('form', { name: 'New task' })
    const submit = within(form).getByRole('button', { name: 'Adding…' })
    expect(submit).toBeDisabled()
    expect(submit.querySelector('.spinner')).toBeInTheDocument()
    expect(form).toHaveAttribute('aria-busy', 'true')
    const cancel = within(form).getByRole('button', { name: 'Cancel' })
    expect(cancel).toBeDisabled()
    await userEvent.click(cancel)
    expect(screen.getByRole('form', { name: 'New task' })).toBeInTheDocument()
    expect(fetchCalls(spy, 'POST', '/api/tasks')).toHaveLength(1)
  })

  it('T13 (B6b): editing a task whose row is locked cannot be overwritten by the row checkbox', async () => {
    const task = makeTask({ id: 40, title: 'Locked while editing' })
    const spy = mockApi({ 'GET /api/tasks': jsonResponse([task]) })
    await openTasks(spy)
    await userEvent.click(await screen.findByRole('button', { name: "Edit 'Locked while editing'" }))
    await userEvent.click(checkbox('Locked while editing'))
    expect(checkbox('Locked while editing')).not.toBeChecked()
    expect(screen.getByLabelText('Completed')).not.toBeChecked()
  })
})

describe('reset password dialog and admin rows (T13-T14)', () => {
  const alice: AdminUser = { ...makeUser('USER'), enabled: true, taskCount: 3, openTaskCount: 2 }
  const self: AdminUser = { ...makeUser('ADMIN'), enabled: true, taskCount: 0, openTaskCount: 0 }
  const rowOf = (username: string) => screen.getByRole('row', { name: new RegExp(username) })

  it('T13 (B7): while the reset is pending Cancel and Escape are ignored and the button shows "Resetting…"', async () => {
    const pending = deferred()
    const spy = mockApi({
      'GET /api/admin/users': jsonResponse([self, alice]),
      'PUT /api/admin/users/2/password': () => pending.promise,
    })
    seedSession('ADMIN')
    renderApp('/admin/users')
    await userEvent.click(await screen.findByRole('button', { name: 'Reset password for alice_01' }))
    const dialog = screen.getByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('New password'), 'N3w#Secret')
    await userEvent.type(within(dialog).getByLabelText('Confirm new password'), 'N3w#Secret')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reset password' }))
    const submit = within(dialog).getByRole('button', { name: 'Resetting…' })
    expect(submit).toBeDisabled()
    expect(submit.querySelector('.spinner')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled()
    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    pending.release(jsonResponse(alice))
    expect(await screen.findByText('Password updated for alice_01')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fetchCalls(spy, 'PUT', '/api/admin/users/2/password')).toHaveLength(1)
  })

  it('T14 (B5): Disable shows a row spinner, locks that row and sends one request', async () => {
    const pending = deferred()
    const spy = mockApi({
      'GET /api/admin/users': jsonResponse([self, alice]),
      'PATCH /api/admin/users/2/status': () => pending.promise,
    })
    seedSession('ADMIN')
    renderApp('/admin/users')
    await userEvent.click(await screen.findByRole('button', { name: 'Disable alice_01' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Disable' }))
    const row = rowOf('alice_01')
    const busy = within(row).getByRole('button', { name: 'Disable alice_01' })
    expect(busy).toHaveTextContent('Disabling…')
    expect(busy).toBeDisabled()
    expect(busy).toHaveAttribute('aria-busy', 'true')
    expect(busy.querySelector('.spinner')).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Reset password for alice_01' })).toBeDisabled()
    await userEvent.click(busy)
    expect(fetchCalls(spy, 'PATCH', '/api/admin/users/2/status')).toHaveLength(1)
    pending.release(jsonResponse({ ...alice, enabled: false }))
    await waitFor(() => expect(within(rowOf('alice_01')).getByRole('button', { name: 'Enable alice_01' })).toBeEnabled())
    expect(within(rowOf('alice_01')).getByText('Disabled')).toBeInTheDocument()
  })

  it('T14: the user search shows "Updating users…" while the list refetches and keeps the old rows', async () => {
    const pending = deferred()
    let listCalls = 0
    mockApi({
      'GET /api/admin/users': () => (++listCalls === 2 ? pending.promise : jsonResponse([self, alice])),
    })
    seedSession('ADMIN')
    renderApp('/admin/users')
    await screen.findByText('alice_01')
    await userEvent.type(screen.getByLabelText('Search users'), 'ali')
    expect(screen.getByText('Updating users…')).toHaveAttribute('role', 'status')
    await waitFor(() => expect(listCalls).toBe(2))
    expect(screen.getByText('alice_01')).toBeInTheDocument()
    pending.release(jsonResponse([alice]))
    await waitFor(() => expect(screen.queryByText('Updating users…')).not.toBeInTheDocument())
  })

  it('shows an empty state and an error banner for the user list', async () => {
    mockApi({ 'GET /api/admin/users': jsonResponse([]) })
    seedSession('ADMIN')
    const { unmount } = renderApp('/admin/users')
    expect(await screen.findByText('No users')).toBeInTheDocument()
    unmount()
    mockApi({ 'GET /api/admin/users': errorResponse(500, 'Unexpected error') })
    renderApp('/admin/users')
    expect(await screen.findByRole('alert')).toHaveTextContent('Unexpected error')
  })
})

describe('security: user text stays text', () => {
  it('renders a task title containing markup as text and stages without any request', async () => {
    const title = '<img src=x onerror=alert(1)>'
    const spy = mockApi({ 'GET /api/tasks': jsonResponse([makeTask({ id: 50, title })]) })
    await openTasks(spy)
    expect(await screen.findByText(title)).toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
    await userEvent.click(checkbox(title))
    expect(screen.getByText('Unsaved change')).toBeInTheDocument()
    expect(localStorage.getItem('todo_app_staged')).toBeNull()
    expect(fetchCalls(spy, 'PATCH', patchPath(50))).toHaveLength(0)
  })
})

describe('same-tick double clicks (DEF-A, DEF-B)', () => {
  it('DEF-A: a double Save click in one tick sends one PATCH and a failure keeps the change staged', async () => {
    const spy = mockApi({
      'GET /api/tasks': jsonResponse([makeTask({ id: 60, title: 'Twice' })]),
      'PATCH /api/tasks/60/completion': errorResponse(500, 'Unexpected error'),
    })
    await openTasks(spy)
    await userEvent.click(await screen.findByRole('checkbox', { name: "Mark 'Twice' as completed" }))
    const save = saveButton('Twice')
    act(() => {
      save.click()
      save.click()
    })
    expect(await screen.findByText('Not saved. Try again.')).toBeInTheDocument()
    expect(fetchCalls(spy, 'PATCH', patchPath(60))).toHaveLength(1)
    expect(checkbox('Twice')).toBeChecked()
    expect(saveButton('Twice')).toBeEnabled()
    expect(clearButton('Twice')).toBeEnabled()
  })

  it('DEF-B: a double submit of the task form in one tick creates one task', async () => {
    const created = makeTask({ id: 61, title: 'Once' })
    const spy = mockApi({ 'GET /api/tasks': jsonResponse([]), 'POST /api/tasks': jsonResponse(created, 201) })
    await openTasks(spy)
    await userEvent.click(await screen.findByRole('button', { name: 'Add task' }))
    await userEvent.type(screen.getByLabelText('Title'), 'Once')
    fireEvent.change(screen.getByLabelText('Due date and time'), { target: { value: toDateTimeLocalValue(hoursFromNow(24)) } })
    const form = screen.getByRole('form', { name: 'New task' })
    act(() => {
      fireEvent.submit(form)
      fireEvent.submit(form)
    })
    await screen.findByText('Once')
    expect(fetchCalls(spy, 'POST', '/api/tasks')).toHaveLength(1)
  })

  it('a double login submit in one tick sends one request', async () => {
    const spy = mockApi({ 'POST /api/auth/login': () => new Promise<Response>(() => {}) })
    renderApp('/login')
    await userEvent.type(screen.getByLabelText('Username'), 'alice_01')
    await userEvent.type(screen.getByLabelText('Password'), 'Str0ng!Pass')
    const form = screen.getByRole('form', { name: 'Log in' })
    act(() => {
      fireEvent.submit(form)
      fireEvent.submit(form)
    })
    expect(fetchCalls(spy, 'POST', '/api/auth/login')).toHaveLength(1)
  })
})

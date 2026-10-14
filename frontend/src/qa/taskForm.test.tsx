import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { adminRow, alice, apiError, bodyOf, callsTo, HOUR, inMs, json, localValue, mockApi, renderApp, seedSession, task } from './qaUtils'

const setDue = (value: string) => fireEvent.change(screen.getByLabelText('Due date and time'), { target: { value } })
const openCreate = async () => userEvent.click(await screen.findByRole('button', { name: 'Add task' }))

describe('QA TaskForm UI20-UI23', () => {
  it('UI20 create: empty title, no due date, due date in the past', async () => {
    seedSession()
    const spy = mockApi({ 'GET /api/tasks': json([]) })
    renderApp('/tasks')
    await openCreate()
    await userEvent.click(document.querySelector('form[aria-label="New task"] button[type=submit]')!)
    expect(screen.getByText('Title is required')).toBeInTheDocument()
    expect(screen.getByText('Due date and time is required')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Title'), 'Late')
    setDue(localValue(Date.now() - 2 * HOUR))
    await userEvent.click(document.querySelector('form[aria-label="New task"] button[type=submit]')!)
    expect(screen.getByText('Due date and time cannot be in the past')).toBeInTheDocument()
    expect(callsTo(spy, 'POST', '/api/tasks')).toHaveLength(0)
  })

  it('UI21 create valid: POST {title, description, dueAt UTC ISO}, item added, form closes', async () => {
    seedSession()
    const due = localValue(Date.now() + 5 * HOUR)
    const created = task({ id: 50, title: 'Pay rent', description: 'Flat 4', dueAt: new Date(due).toISOString() })
    const spy = mockApi({ 'GET /api/tasks': json([]), 'POST /api/tasks': json(created, 201) })
    renderApp('/tasks')
    await openCreate()
    await userEvent.type(screen.getByLabelText('Title'), 'Pay rent')
    await userEvent.type(screen.getByLabelText('Description'), 'Flat 4')
    setDue(due)
    await userEvent.click(document.querySelector('form[aria-label="New task"] button[type=submit]')!)
    await screen.findByText('Pay rent')
    const body = bodyOf(spy, 'POST', '/api/tasks')
    expect(body.title).toBe('Pay rent')
    expect(body.description).toBe('Flat 4')
    expect(body.dueAt).toBe(new Date(due).toISOString())
    expect(body.dueAt).toMatch(/Z$/)
    expect(Object.keys(body).sort()).toEqual(['description', 'dueAt', 'title'])
    expect(screen.queryByRole('form', { name: 'New task' })).toBeNull()
  })

  it('UI22 edit: prefilled local time, PUT with all 4 fields, past due allowed, item updated', async () => {
    seedSession()
    const t = task({ id: 60, title: 'Old', description: 'd', dueAt: inMs(10 * HOUR) })
    const pastLocal = localValue(Date.now() - 3 * HOUR)
    const updated = { ...t, title: 'New', dueAt: new Date(pastLocal).toISOString(), completed: true }
    const spy = mockApi({ 'GET /api/tasks': json([t]), 'PUT /api/tasks/60': json(updated) })
    renderApp('/tasks')
    await userEvent.click(await screen.findByRole('button', { name: "Edit 'Old'" }))
    expect(screen.getByLabelText('Due date and time')).toHaveValue(localValue(new Date(t.dueAt).getTime()))
    expect(screen.getByLabelText('Title')).toHaveValue('Old')
    await userEvent.clear(screen.getByLabelText('Title'))
    await userEvent.type(screen.getByLabelText('Title'), 'New')
    setDue(pastLocal)
    await userEvent.click(screen.getByLabelText('Completed'))
    await userEvent.click(within(screen.getByRole('form', { name: 'Edit task' })).getByRole('button', { name: 'Save' }))
    await screen.findByText('New')
    expect(bodyOf(spy, 'PUT', '/api/tasks/60')).toEqual({
      title: 'New', description: 'd', dueAt: new Date(pastLocal).toISOString(), completed: true,
    })
    expect(screen.queryByText('Old')).toBeNull()
  })

  it('UI23 server fieldErrors appear next to the fields and the form stays open', async () => {
    seedSession()
    mockApi({
      'GET /api/tasks': json([]),
      'POST /api/tasks': apiError(400, 'Validation failed', [
        { field: 'title', message: 'Title must be at most 100 characters' },
        { field: 'dueAt', message: 'Due date and time cannot be in the past' },
      ]),
    })
    renderApp('/tasks')
    await openCreate()
    await userEvent.type(screen.getByLabelText('Title'), 'x')
    setDue(localValue(Date.now() + HOUR))
    await userEvent.click(document.querySelector('form[aria-label="New task"] button[type=submit]')!)
    expect(await screen.findByText('Title must be at most 100 characters')).toBeInTheDocument()
    expect(screen.getByText('Due date and time cannot be in the past')).toBeInTheDocument()
    expect(screen.getByRole('form', { name: 'New task' })).toBeInTheDocument()
  })

  it('UI23 delete: cancel makes no call, confirm sends DELETE and removes the item', async () => {
    seedSession()
    const spy = mockApi({
      'GET /api/tasks': json([task({ id: 70, title: 'Doomed' }), task({ id: 71, title: 'Survivor' })]),
      'DELETE /api/tasks/70': json(null, 204),
    })
    renderApp('/tasks')
    await userEvent.click(await screen.findByRole('button', { name: "Delete 'Doomed'" }))
    const dialog = screen.getByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(callsTo(spy, 'DELETE', '/api/tasks/70')).toHaveLength(0)
    expect(screen.getByText('Doomed')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: "Delete 'Doomed'" }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(screen.queryByText('Doomed')).toBeNull())
    expect(callsTo(spy, 'DELETE', '/api/tasks/70')).toHaveLength(1)
    expect(screen.getByText('Survivor')).toBeInTheDocument()
  })

  it('UI23 Escape cancels the delete dialog', async () => {
    seedSession()
    const spy = mockApi({ 'GET /api/tasks': json([task({ id: 72, title: 'Keep' })]) })
    renderApp('/tasks')
    await userEvent.click(await screen.findByRole('button', { name: "Delete 'Keep'" }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(callsTo(spy, 'DELETE', '/api/tasks/72')).toHaveLength(0)
  })
})

describe('QA Admin user tasks UI30', () => {
  it('heading "Tasks of alice_01" and every call goes to /api/admin/users/2/tasks', async () => {
    seedSession('ADMIN')
    const t = task({ id: 80, title: 'Alice chore', dueAt: inMs(4 * HOUR) })
    const due = localValue(Date.now() + 8 * HOUR)
    const spy = mockApi({
      'GET /api/admin/users/2': json(adminRow(alice)),
      'GET /api/admin/users/2/tasks': json([t]),
      'POST /api/admin/users/2/tasks': json(task({ id: 81, title: 'Made by admin' }), 201),
      'PUT /api/admin/users/2/tasks/80': json({ ...t, title: 'Edited' }),
      'PATCH /api/admin/users/2/tasks/80/completion': json({ ...t, title: 'Edited', completed: true }),
      'DELETE /api/admin/users/2/tasks/80': json(null, 204),
    })
    renderApp('/admin/users/2/tasks')
    expect(await screen.findByRole('heading', { name: /Tasks of alice_01/ })).toBeInTheDocument()
    await screen.findByText('Alice chore')

    // create
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }))
    await userEvent.type(screen.getByLabelText('Title'), 'Made by admin')
    setDue(due)
    await userEvent.click(document.querySelector('form[aria-label="New task"] button[type=submit]')!)
    await waitFor(() => expect(callsTo(spy, 'POST', '/api/admin/users/2/tasks')).toHaveLength(1))
    // edit
    await userEvent.click(await screen.findByRole('button', { name: "Edit 'Alice chore'" }))
    await userEvent.click(within(screen.getByRole('form', { name: 'Edit task' })).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(callsTo(spy, 'PUT', '/api/admin/users/2/tasks/80')).toHaveLength(1))
    // complete
    await userEvent.click(await screen.findByRole('checkbox', { name: /Mark 'Edited' as completed/ }))
    await waitFor(() => expect(callsTo(spy, 'PATCH', '/api/admin/users/2/tasks/80/completion')).toHaveLength(1))
    // delete
    await userEvent.click(await screen.findByRole('button', { name: "Delete 'Edited'" }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(callsTo(spy, 'DELETE', '/api/admin/users/2/tasks/80')).toHaveLength(1))
    // search
    await userEvent.type(screen.getByLabelText('Search tasks'), 'chore')
    await waitFor(() => expect(callsTo(spy, 'GET', '/api/admin/users/2/tasks').some(([u]) => String(u).includes('q=chore'))).toBe(true), { timeout: 2000 })
    // nothing went to the user's own endpoint
    expect(spy.mock.calls.filter(([u]) => String(u).startsWith('/api/tasks'))).toHaveLength(0)
  })
})

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { toDateTimeLocalValue, toIsoUtc } from '../utils/dateUtils'
import {
  errorResponse, fetchCalls, hoursFromNow, jsonResponse, lastBody, makeTask, mockApi, renderApp, seedSession,
} from '../test/testUtils'

afterEach(() => vi.useRealTimers())

const openTasks = async (spy: ReturnType<typeof mockApi>) => {
  seedSession('USER')
  renderApp('/tasks')
  await waitFor(() => expect(fetchCalls(spy, 'GET', '/api/tasks').length).toBeGreaterThan(0))
}
const listUrls = (spy: ReturnType<typeof mockApi>) => fetchCalls(spy, 'GET', '/api/tasks').map(([u]) => String(u))

describe('task list (UI13-UI19)', () => {
  it('UI13: empty state', async () => {
    mockApi({ 'GET /api/tasks': jsonResponse([]) })
    seedSession('USER')
    renderApp('/tasks')
    expect(await screen.findByText('No tasks yet')).toBeInTheDocument()
  })

  it('UI14: API order, local due time, Overdue only on open overdue tasks', async () => {
    const tasks = [
      makeTask({ id: 1, title: 'Old open', dueAt: hoursFromNow(-48) }),
      makeTask({ id: 2, title: 'Old done', dueAt: hoursFromNow(-24), completed: true }),
      makeTask({ id: 3, title: 'Future', dueAt: '2026-12-10T17:00:00Z' }),
    ]
    mockApi({ 'GET /api/tasks': jsonResponse(tasks) })
    seedSession('USER')
    renderApp('/tasks')
    const items = await screen.findAllByRole('listitem')
    expect(items.map((i) => within(i).getByText(/^Task|Old|Future/).textContent)).toEqual(['Old open', 'Old done', 'Future'])
    expect(within(items[0]).getByText('Overdue')).toBeInTheDocument()
    expect(within(items[1]).queryByText('Overdue')).not.toBeInTheDocument()
    expect(within(items[2]).queryByText('Overdue')).not.toBeInTheDocument()
    expect(items[2].textContent).toContain(
      new Date('2026-12-10T17:00:00Z').toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
    )
  })

  it('UI15: Overdue appears without reload as time passes', async () => {
    vi.useFakeTimers()
    mockApi({ 'GET /api/tasks': jsonResponse([makeTask({ title: 'Soon', dueAt: new Date(Date.now() + 30_000).toISOString() })]) })
    seedSession('USER')
    renderApp('/tasks')
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(screen.getByText('Soon')).toBeInTheDocument()
    expect(screen.queryByText('Overdue')).not.toBeInTheDocument()
    await act(async () => { await vi.advanceTimersByTimeAsync(61_000) })
    expect(screen.getByText('Overdue')).toBeInTheDocument()
  })

  it('UI16: filter tabs request the status and highlight the tab', async () => {
    const spy = mockApi({ 'GET /api/tasks': jsonResponse([]) })
    await openTasks(spy)
    await userEvent.click(screen.getByRole('tab', { name: 'Active' }))
    await waitFor(() => expect(listUrls(spy)).toContain('/api/tasks?status=active'))
    expect(screen.getByRole('tab', { name: 'Active' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'false')
    await userEvent.click(screen.getByRole('tab', { name: 'Completed' }))
    await waitFor(() => expect(listUrls(spy)).toContain('/api/tasks?status=completed'))
  })

  it('UI17: debounced search with the current status; Clear resets; no-match message', async () => {
    const spy = mockApi({ 'GET /api/tasks': jsonResponse([]) })
    await openTasks(spy)
    await userEvent.click(screen.getByRole('tab', { name: 'Active' }))
    await waitFor(() => expect(listUrls(spy)).toHaveLength(2))
    await userEvent.type(screen.getByLabelText('Search tasks'), 'milk')
    expect(listUrls(spy)).toHaveLength(2)
    await waitFor(() => expect(listUrls(spy)).toHaveLength(3))
    expect(listUrls(spy)[2]).toBe('/api/tasks?status=active&q=milk')
    expect(await screen.findByText('No tasks match your search')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
    await waitFor(() => expect(listUrls(spy)[3]).toBe('/api/tasks?status=active'))
    expect(screen.getByLabelText('Search tasks')).toHaveValue('')
  })

  it('UI18: toggle flips at once, sends PATCH, and rolls back with an error on failure', async () => {
    let release: (r: Response) => void = () => {}
    const task = makeTask({ id: 7, title: 'Pay rent' })
    const spy = mockApi({
      'GET /api/tasks': jsonResponse([task]),
      'PATCH /api/tasks/7/completion': () => new Promise<Response>((resolve) => (release = resolve)),
    })
    await openTasks(spy)
    const box = await screen.findByLabelText("Mark 'Pay rent' as completed")
    await userEvent.click(box)
    expect(box).toBeChecked()
    expect(lastBody(spy, 'PATCH', '/api/tasks/7/completion')).toEqual({ completed: true })
    release(errorResponse(500, 'Unexpected error'))
    expect(await screen.findByText('Unexpected error')).toBeInTheDocument()
    expect(screen.getByLabelText("Mark 'Pay rent' as completed")).not.toBeChecked()
  })

  it('UI19: completing an overdue task is allowed and removes the marker', async () => {
    const task = makeTask({ id: 8, title: 'Late', dueAt: hoursFromNow(-5) })
    const spy = mockApi({
      'GET /api/tasks': jsonResponse([task]),
      'PATCH /api/tasks/8/completion': jsonResponse({ ...task, completed: true, completedAt: new Date().toISOString() }),
    })
    await openTasks(spy)
    expect(await screen.findByText('Overdue')).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText("Mark 'Late' as completed"))
    await waitFor(() => expect(screen.queryByText('Overdue')).not.toBeInTheDocument())
    expect(screen.getByLabelText("Mark 'Late' as completed")).toBeChecked()
  })
})

describe('task form and delete (UI20-UI23)', () => {
  it('UI20: create validation blocks the call', async () => {
    const spy = mockApi({ 'GET /api/tasks': jsonResponse([]) })
    await openTasks(spy)
    await userEvent.click(await screen.findByRole('button', { name: 'Add task' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add task', description: '' }))
    expect(screen.getByText('Title is required')).toBeInTheDocument()
    expect(screen.getByText('Due date and time is required')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Title'), 'x')
    fireEvent.change(screen.getByLabelText('Due date and time'), { target: { value: '2020-01-01T10:00' } })
    await userEvent.click(screen.getByRole('button', { name: 'Add task', description: '' }))
    expect(screen.getByText('Due date and time cannot be in the past')).toBeInTheDocument()
    expect(fetchCalls(spy, 'POST', '/api/tasks')).toHaveLength(0)
  })

  it('UI21: valid create posts UTC ISO, adds the item and closes the form', async () => {
    const created = makeTask({ id: 11, title: 'Buy milk', description: 'two litres' })
    const spy = mockApi({ 'GET /api/tasks': jsonResponse([]), 'POST /api/tasks': jsonResponse(created, 201) })
    await openTasks(spy)
    await userEvent.click(await screen.findByRole('button', { name: 'Add task' }))
    const due = toDateTimeLocalValue(hoursFromNow(48))
    await userEvent.type(screen.getByLabelText('Title'), 'Buy milk')
    await userEvent.type(screen.getByLabelText('Description'), 'two litres')
    fireEvent.change(screen.getByLabelText('Due date and time'), { target: { value: due } })
    await userEvent.click(screen.getByRole('button', { name: 'Add task', description: '' }))
    expect(await screen.findByText('Buy milk')).toBeInTheDocument()
    expect(lastBody(spy, 'POST', '/api/tasks')).toEqual({
      title: 'Buy milk', description: 'two litres', dueAt: toIsoUtc(due),
    })
    expect(screen.queryByRole('form', { name: 'New task' })).not.toBeInTheDocument()
  })

  it('UI22: edit pre-fills local time, PUTs all four fields (past due allowed) and updates the item', async () => {
    const task = makeTask({ id: 12, title: 'Original', dueAt: '2026-12-10T17:00:00Z' })
    const updated = { ...task, title: 'Renamed', completed: true }
    const spy = mockApi({ 'GET /api/tasks': jsonResponse([task]), 'PUT /api/tasks/12': jsonResponse(updated) })
    await openTasks(spy)
    await userEvent.click(await screen.findByRole('button', { name: "Edit 'Original'" }))
    expect(screen.getByLabelText('Due date and time')).toHaveValue(toDateTimeLocalValue(task.dueAt))
    await userEvent.clear(screen.getByLabelText('Title'))
    await userEvent.type(screen.getByLabelText('Title'), 'Renamed')
    fireEvent.change(screen.getByLabelText('Due date and time'), { target: { value: '2020-01-01T10:00' } })
    await userEvent.click(screen.getByLabelText('Completed'))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Renamed')).toBeInTheDocument()
    expect(lastBody(spy, 'PUT', '/api/tasks/12')).toEqual({
      title: 'Renamed', description: null, dueAt: toIsoUtc('2020-01-01T10:00'), completed: true,
    })
  })

  it('UI23: server fieldErrors appear next to the fields', async () => {
    const spy = mockApi({
      'GET /api/tasks': jsonResponse([]),
      'POST /api/tasks': errorResponse(400, 'Validation failed', [{ field: 'title', message: 'Title must be at most 100 characters' }]),
    })
    await openTasks(spy)
    await userEvent.click(await screen.findByRole('button', { name: 'Add task' }))
    await userEvent.type(screen.getByLabelText('Title'), 'x')
    fireEvent.change(screen.getByLabelText('Due date and time'), { target: { value: toDateTimeLocalValue(hoursFromNow(24)) } })
    await userEvent.click(screen.getByRole('button', { name: 'Add task', description: '' }))
    expect(await screen.findByText('Title must be at most 100 characters')).toBeInTheDocument()
    expect(screen.getByRole('form', { name: 'New task' })).toBeInTheDocument()
  })

  it('UI23: delete cancel makes no call, confirm sends DELETE and removes the item', async () => {
    const task = makeTask({ id: 13, title: 'Doomed' })
    const spy = mockApi({ 'GET /api/tasks': jsonResponse([task]), 'DELETE /api/tasks/13': jsonResponse(null, 204) })
    await openTasks(spy)
    await userEvent.click(await screen.findByRole('button', { name: "Delete 'Doomed'" }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    expect(fetchCalls(spy, 'DELETE', '/api/tasks/13')).toHaveLength(0)
    expect(screen.getByText('Doomed')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: "Delete 'Doomed'" }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: "Delete 'Doomed'" }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(screen.queryByText('Doomed')).not.toBeInTheDocument())
    expect(fetchCalls(spy, 'DELETE', '/api/tasks/13')).toHaveLength(1)
  })
})

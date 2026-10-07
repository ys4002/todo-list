import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiError, callsTo, HOUR, inMs, json, mockApi, renderApp, seedSession, task, urlsOf } from './qaUtils'

afterEach(() => vi.useRealTimers())

const dueText = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const itemOf = (title: string) => screen.getByText(title).closest('li') as HTMLElement

describe('QA Tasks UI13-UI19', () => {
  it('UI13 empty list shows "No tasks yet"', async () => {
    seedSession()
    mockApi({ 'GET /api/tasks': json([]) })
    renderApp('/tasks')
    expect(await screen.findByText('No tasks yet')).toBeInTheDocument()
  })

  it('UI14 keeps API order, shows local due time and Overdue only for open overdue tasks', async () => {
    seedSession()
    const open = task({ title: 'Open late', dueAt: inMs(-2 * HOUR) })
    const doneLate = task({ title: 'Done late', dueAt: inMs(-3 * HOUR), completed: true, completedAt: inMs(-HOUR) })
    const future = task({ title: 'Future', dueAt: inMs(5 * HOUR) })
    mockApi({ 'GET /api/tasks': json([doneLate, open, future]) })
    renderApp('/tasks')
    await screen.findByText('Open late')
    const titles = screen.getAllByRole('listitem').map((li) => li.querySelector('.task-title')?.textContent)
    expect(titles).toEqual(['Done late', 'Open late', 'Future'])
    expect(itemOf('Open late')).toHaveTextContent(dueText(open.dueAt))
    expect(within(itemOf('Open late')).getByText('Overdue')).toBeInTheDocument()
    expect(within(itemOf('Done late')).queryByText('Overdue')).toBeNull()
    expect(within(itemOf('Future')).queryByText('Overdue')).toBeNull()
  })

  it('UI15 Overdue appears without reload once time passes the due time', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
    seedSession()
    mockApi({ 'GET /api/tasks': json([task({ title: 'Soon', dueAt: inMs(30_000) })]) })
    renderApp('/tasks')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(screen.getByText('Soon')).toBeInTheDocument()
    expect(screen.queryByText('Overdue')).toBeNull()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000)
    })
    expect(screen.getByText('Overdue')).toBeInTheDocument()
  })

  it('UI16 filter tabs request ?status=active / completed and highlight the tab', async () => {
    seedSession()
    const spy = mockApi({ 'GET /api/tasks': json([]) })
    renderApp('/tasks')
    await screen.findByText('No tasks yet')
    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(screen.getByRole('tab', { name: 'Active' }))
    await waitFor(() => expect(urlsOf(spy, 'GET', '/api/tasks').some((u) => u.includes('status=active'))).toBe(true))
    expect(screen.getByRole('tab', { name: 'Active' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'false')
    await userEvent.click(screen.getByRole('tab', { name: 'Completed' }))
    await waitFor(() => expect(urlsOf(spy, 'GET', '/api/tasks').some((u) => u.includes('status=completed'))).toBe(true))
    expect(screen.getByRole('tab', { name: 'Completed' })).toHaveAttribute('aria-selected', 'true')
  })

  it('UI17 search sends one debounced request with q and the current status; Clear resets', async () => {
    seedSession()
    const spy = mockApi({ 'GET /api/tasks': (url) => json(url.includes('q=zzz') ? [] : [task({ title: 'Buy milk' })]) })
    renderApp('/tasks')
    await screen.findByText('Buy milk')
    await userEvent.click(screen.getByRole('tab', { name: 'Active' }))
    await waitFor(() => expect(urlsOf(spy, 'GET', '/api/tasks').some((u) => u.includes('status=active'))).toBe(true))
    const before = callsTo(spy, 'GET', '/api/tasks').length
    await userEvent.type(screen.getByLabelText('Search tasks'), 'zzz')
    // nothing is sent before the 300 ms debounce elapses
    expect(callsTo(spy, 'GET', '/api/tasks')).toHaveLength(before)
    await waitFor(() => expect(callsTo(spy, 'GET', '/api/tasks')).toHaveLength(before + 1), { timeout: 2000 })
    const url = urlsOf(spy, 'GET', '/api/tasks').at(-1)!
    expect(url).toContain('q=zzz')
    expect(url).toContain('status=active')
    expect(await screen.findByText('No tasks match your search')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByLabelText('Search tasks')).toHaveValue('')
    expect(await screen.findByText('Buy milk')).toBeInTheDocument()
    expect(urlsOf(spy, 'GET', '/api/tasks').at(-1)).not.toContain('q=')
  })

  it('UI18 toggle flips immediately and PATCHes {completed:true}', async () => {
    seedSession()
    const t = task({ id: 7, title: 'Flip me' })
    let release!: (r: Response) => void
    const spy = mockApi({
      'GET /api/tasks': json([t]),
      'PATCH /api/tasks/7/completion': () => new Promise<Response>((resolve) => (release = resolve)),
    })
    renderApp('/tasks')
    const box = await screen.findByRole('checkbox', { name: "Mark 'Flip me' as completed" })
    expect(box).not.toBeChecked()
    await userEvent.click(box)
    expect(box).toBeChecked() // before the server answered
    expect(JSON.parse(String(callsTo(spy, 'PATCH', '/api/tasks/7/completion')[0][1]?.body))).toEqual({ completed: true })
    await act(async () => release(json({ ...t, completed: true, completedAt: inMs(0) })))
    expect(box).toBeChecked()
  })

  it('UI18 failure rolls the checkbox back and shows an error', async () => {
    seedSession()
    mockApi({
      'GET /api/tasks': json([task({ id: 8, title: 'Fail me' })]),
      'PATCH /api/tasks/8/completion': apiError(500, 'Unexpected error'),
    })
    renderApp('/tasks')
    const box = await screen.findByRole('checkbox', { name: "Mark 'Fail me' as completed" })
    await userEvent.click(box)
    expect(await screen.findByRole('alert')).toHaveTextContent('Unexpected error')
    expect(box).not.toBeChecked()
  })

  it('UI19 completing an overdue task is allowed and removes the Overdue marker', async () => {
    seedSession()
    const t = task({ id: 9, title: 'Too late', dueAt: inMs(-24 * HOUR) })
    mockApi({
      'GET /api/tasks': json([t]),
      'PATCH /api/tasks/9/completion': json({ ...t, completed: true, completedAt: inMs(0) }),
    })
    renderApp('/tasks')
    expect(await screen.findByText('Overdue')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('checkbox', { name: "Mark 'Too late' as completed" }))
    await waitFor(() => expect(screen.queryByText('Overdue')).toBeNull())
    expect(screen.getByRole('checkbox', { name: "Mark 'Too late' as completed" })).toBeChecked()
  })
})

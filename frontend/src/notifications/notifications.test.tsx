import { act, fireEvent, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ConfirmDialog from '../components/ConfirmDialog'
import { NotificationProvider } from './NotificationProvider'
import { ERROR_DURATION_MS, EXIT_DURATION_MS, SUCCESS_INFO_DURATION_MS, useNotifications } from './notificationContext'
import type { Notifications } from './notificationContext'

let notify: Notifications

function Probe() {
  const api = useNotifications()
  useEffect(() => {
    notify = api
  })
  return null
}

function renderProvider(extra?: React.ReactNode) {
  return render(
    <NotificationProvider>
      <Probe />
      {extra}
    </NotificationProvider>,
  )
}

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))
const push = (fn: () => number) => {
  let id = 0
  act(() => {
    id = fn()
  })
  return id
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('NotificationProvider', () => {
  it('gives each type its role and keeps the viewport free of roles and live regions', () => {
    renderProvider()
    push(() => notify.success('Saved'))
    push(() => notify.info('FYI'))
    push(() => notify.error('Broke'))
    expect(screen.getByText('Saved').closest('[role]')).toHaveAttribute('role', 'status')
    expect(screen.getByText('FYI').closest('[role]')).toHaveAttribute('role', 'status')
    expect(screen.getByRole('alert')).toHaveTextContent('Broke')
    const viewport = screen.getByLabelText('Notifications')
    expect(viewport).not.toHaveAttribute('role')
    expect(viewport).not.toHaveAttribute('aria-live')
    expect(viewport.querySelector('ul, li')).toBeNull()
  })

  it('renders messages as text, not markup', () => {
    renderProvider()
    push(() => notify.error('<img src=x onerror=alert(1)>'))
    expect(screen.getByRole('alert')).toHaveTextContent('<img src=x onerror=alert(1)>')
    expect(document.querySelector('img')).toBeNull()
  })

  it('auto-dismisses success after its duration and the exit delay', async () => {
    renderProvider()
    push(() => notify.success('Saved'))
    await advance(SUCCESS_INFO_DURATION_MS - 1)
    expect(screen.getByText('Saved')).toBeInTheDocument()
    await advance(1 + EXIT_DURATION_MS)
    expect(screen.queryByText('Saved')).toBeNull()
  })

  it('keeps errors longer than success', async () => {
    renderProvider()
    push(() => notify.error('Broke'))
    await advance(ERROR_DURATION_MS - 1)
    expect(screen.getByText('Broke')).toBeInTheDocument()
    await advance(1 + EXIT_DURATION_MS)
    expect(screen.queryByText('Broke')).toBeNull()
  })

  it('pauses on hover and resumes with the remaining time', async () => {
    renderProvider()
    push(() => notify.success('Saved'))
    await advance(3000)
    fireEvent.mouseEnter(screen.getByText('Saved').closest('[role]')!)
    await advance(10_000)
    expect(screen.getByText('Saved')).toBeInTheDocument()
    fireEvent.mouseLeave(screen.getByText('Saved').closest('[role]')!)
    await advance(1999)
    expect(screen.getByText('Saved')).toBeInTheDocument()
    await advance(1 + EXIT_DURATION_MS)
    expect(screen.queryByText('Saved')).toBeNull()
  })

  it('pauses while focus is inside and resumes when it leaves', async () => {
    renderProvider()
    push(() => notify.success('Saved'))
    await advance(3000)
    const toast = screen.getByText('Saved').closest('[role]')!
    const close = screen.getByRole('button', { name: 'Dismiss notification' })
    fireEvent.focusIn(close)
    await advance(10_000)
    expect(screen.getByText('Saved')).toBeInTheDocument()
    fireEvent.focusOut(close, { relatedTarget: document.body })
    expect(toast).toBeInTheDocument()
    await advance(2000 + EXIT_DURATION_MS)
    expect(screen.queryByText('Saved')).toBeNull()
  })

  it('removes a toast with the close button', async () => {
    renderProvider()
    push(() => notify.success('Saved'))
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }))
    await advance(EXIT_DURATION_MS)
    expect(screen.queryByText('Saved')).toBeNull()
  })

  it('closes on Escape inside the toast without closing an open dialog', async () => {
    const onCancel = vi.fn()
    renderProvider(
      <ConfirmDialog title="Delete" confirmLabel="Delete" onConfirm={() => {}} onCancel={onCancel}>
        <p>Sure?</p>
      </ConfirmDialog>,
    )
    push(() => notify.error('Broke'))
    const close = screen.getByRole('button', { name: 'Dismiss notification' })
    close.focus()
    fireEvent.keyDown(close, { key: 'Escape' })
    await advance(EXIT_DURATION_MS)
    expect(screen.queryByText('Broke')).toBeNull()
    expect(onCancel).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shows at most 3 toasts and drops the oldest', () => {
    renderProvider()
    for (const message of ['one', 'two', 'three', 'four']) push(() => notify.info(message))
    expect(screen.queryByText('one')).toBeNull()
    expect(screen.getAllByRole('status')).toHaveLength(3)
    expect(screen.getByText('four')).toBeInTheDocument()
  })

  it('dedupes identical toasts and restarts the timer', async () => {
    renderProvider()
    const first = push(() => notify.success('Saved'))
    await advance(3000)
    const second = push(() => notify.success('Saved'))
    expect(second).toBe(first)
    expect(screen.getAllByText('Saved')).toHaveLength(1)
    await advance(4000)
    expect(screen.getByText('Saved')).toBeInTheDocument()
    await advance(1000 + EXIT_DURATION_MS)
    expect(screen.queryByText('Saved')).toBeNull()
  })

  it('returns a stable API and clears timers on unmount', async () => {
    const { unmount } = renderProvider()
    const before = notify
    push(() => notify.success('Saved'))
    expect(notify).toBe(before)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('clear() removes every toast at once and cancels all timers', async () => {
    renderProvider()
    push(() => notify.success('Saved'))
    push(() => notify.error('Broke'))
    const leaving = push(() => notify.info('FYI'))
    act(() => notify.dismiss(leaving))
    act(() => notify.clear())
    expect(screen.getByLabelText('Notifications')).toBeEmptyDOMElement()
    expect(vi.getTimerCount()).toBe(0)
    await advance(10_000)
    expect(screen.getByLabelText('Notifications')).toBeEmptyDOMElement()
    push(() => notify.success('Later'))
    await advance(SUCCESS_INFO_DURATION_MS)
    expect(screen.getByText('Later')).toBeInTheDocument()
    await advance(EXIT_DURATION_MS)
    expect(screen.queryByText('Later')).toBeNull()
  })

  it('throws a clear error outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow(/NotificationProvider/)
  })
})

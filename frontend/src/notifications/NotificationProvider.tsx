import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import Toast from './Toast'
import {
  ERROR_DURATION_MS,
  EXIT_DURATION_MS,
  MAX_VISIBLE_TOASTS,
  NotificationContext,
  SUCCESS_INFO_DURATION_MS,
} from './notificationContext'
import type { NotificationType, Notifications, ToastData } from './notificationContext'

interface Countdown {
  handle: ReturnType<typeof setTimeout> | null
  remaining: number
  startedAt: number
  hovered: boolean
  focused: boolean
}

function durationFor(type: NotificationType): number {
  return type === 'error' ? ERROR_DURATION_MS : SUCCESS_INFO_DURATION_MS
}

function isPaused(countdown: Countdown): boolean {
  return countdown.hovered || countdown.focused
}

function cancelCountdown(countdowns: Map<number, Countdown>, id: number): void {
  const countdown = countdowns.get(id)
  if (countdown?.handle) clearTimeout(countdown.handle)
  countdowns.delete(id)
}

/** Holds the toast list and their timers, and renders the toast stack after its children. */
export function NotificationProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([])
  // The ref is the source of truth so pushes can dedupe synchronously; state only mirrors it for rendering.
  const toastsRef = useRef<ToastData[]>([])
  const nextIdRef = useRef(1)
  const countdowns = useRef(new Map<number, Countdown>())
  const exitTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const commit = useCallback((next: ToastData[]) => {
    toastsRef.current = next
    setToasts(next)
  }, [])

  const removeNow = useCallback(
    (id: number) => {
      cancelCountdown(countdowns.current, id)
      const exitTimer = exitTimers.current.get(id)
      if (exitTimer) clearTimeout(exitTimer)
      exitTimers.current.delete(id)
      commit(toastsRef.current.filter((t) => t.id !== id))
    },
    [commit],
  )

  const dismiss = useCallback(
    (id: number) => {
      const toast = toastsRef.current.find((t) => t.id === id)
      if (!toast || toast.leaving) return
      cancelCountdown(countdowns.current, id)
      commit(toastsRef.current.map((t) => (t.id === id ? { ...t, leaving: true } : t)))
      exitTimers.current.set(
        id,
        setTimeout(() => removeNow(id), EXIT_DURATION_MS),
      )
    },
    [commit, removeNow],
  )

  const startCountdown = useCallback(
    (id: number, countdown: Countdown) => {
      countdown.startedAt = Date.now()
      countdown.handle = setTimeout(() => dismiss(id), countdown.remaining)
    },
    [dismiss],
  )

  const push = useCallback(
    (type: NotificationType, message: string) => {
      const existing = toastsRef.current.find((t) => t.type === type && t.message === message && !t.leaving)
      if (existing) {
        const countdown = countdowns.current.get(existing.id)
        if (countdown) {
          if (countdown.handle) clearTimeout(countdown.handle)
          countdown.handle = null
          countdown.remaining = existing.duration
          if (!isPaused(countdown)) startCountdown(existing.id, countdown)
        }
        commit(toastsRef.current.map((t) => (t.id === existing.id ? { ...t, generation: t.generation + 1 } : t)))
        return existing.id
      }

      const id = nextIdRef.current++
      const duration = durationFor(type)
      const toast: ToastData = { id, type, message, duration, leaving: false, generation: 0 }
      commit([...toastsRef.current, toast])
      const countdown: Countdown = { handle: null, remaining: duration, startedAt: 0, hovered: false, focused: false }
      countdowns.current.set(id, countdown)
      startCountdown(id, countdown)

      const visible = toastsRef.current.filter((t) => !t.leaving)
      for (const oldest of visible.slice(0, Math.max(0, visible.length - MAX_VISIBLE_TOASTS))) removeNow(oldest.id)
      return id
    },
    [commit, removeNow, startCountdown],
  )

  const updatePause = useCallback(
    (id: number, change: Partial<Pick<Countdown, 'hovered' | 'focused'>>) => {
      const countdown = countdowns.current.get(id)
      if (!countdown) return
      const wasPaused = isPaused(countdown)
      Object.assign(countdown, change)
      const nowPaused = isPaused(countdown)
      if (nowPaused && !wasPaused) {
        if (countdown.handle) clearTimeout(countdown.handle)
        countdown.handle = null
        countdown.remaining = Math.max(0, countdown.remaining - (Date.now() - countdown.startedAt))
      } else if (!nowPaused && wasPaused) {
        startCountdown(id, countdown)
      }
    },
    [startCountdown],
  )

  useEffect(() => {
    const countdownMap = countdowns.current
    const exitTimerMap = exitTimers.current
    return () => {
      countdownMap.forEach((c) => c.handle && clearTimeout(c.handle))
      exitTimerMap.forEach((handle) => clearTimeout(handle))
      countdownMap.clear()
      exitTimerMap.clear()
    }
  }, [])

  const api = useMemo<Notifications>(
    () => ({
      success: (message) => push('success', message),
      error: (message) => push('error', message),
      info: (message) => push('info', message),
      dismiss,
    }),
    [push, dismiss],
  )

  return (
    <NotificationContext.Provider value={api}>
      {children}
      <section aria-label="Notifications" className="toast-viewport">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            toast={toast}
            onDismiss={dismiss}
            onHoverChange={(id, hovered) => updatePause(id, { hovered })}
            onFocusChange={(id, focused) => updatePause(id, { focused })}
          />
        ))}
      </section>
    </NotificationContext.Provider>
  )
}

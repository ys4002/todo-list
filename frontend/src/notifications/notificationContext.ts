import { createContext, useContext } from 'react'

export type NotificationType = 'success' | 'error' | 'info'

export interface ToastData {
  id: number
  type: NotificationType
  message: string
  /** Auto-dismiss time in milliseconds (drives the progress bar). */
  duration: number
  /** Set while the exit animation runs. */
  leaving: boolean
  /** Bumped when a duplicate restarts the timer, so the progress bar restarts too. */
  generation: number
}

export interface Notifications {
  success: (message: string) => number
  error: (message: string) => number
  info: (message: string) => number
  dismiss: (id: number) => void
}

export const SUCCESS_INFO_DURATION_MS = 5000
export const ERROR_DURATION_MS = 8000
export const EXIT_DURATION_MS = 150
export const MAX_VISIBLE_TOASTS = 3

export const NotificationContext = createContext<Notifications | null>(null)

export function useNotifications(): Notifications {
  const context = useContext(NotificationContext)
  if (!context) throw new Error('useNotifications must be used inside a NotificationProvider')
  return context
}

import type { CSSProperties, FocusEvent, KeyboardEvent } from 'react'
import type { NotificationType, ToastData } from './notificationContext'

const ICON_PATHS: Record<NotificationType, string> = {
  success: 'M6.5 10.5l2.5 2.5 4.5-5',
  error: 'M10 6v5M10 14h.01',
  info: 'M10 9v5M10 6h.01',
}

interface Props {
  toast: ToastData
  onDismiss: (id: number) => void
  onHoverChange: (id: number, hovered: boolean) => void
  onFocusChange: (id: number, focused: boolean) => void
}

export default function Toast({ toast, onDismiss, onHoverChange, onFocusChange }: Props) {
  const { id, type, message, duration, leaving, generation } = toast

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) onFocusChange(id, false)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Escape') return
    // Do not also close a dialog that listens for Escape on the document.
    event.stopPropagation()
    onDismiss(id)
  }

  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      aria-atomic="true"
      className={`toast toast-${type}${leaving ? ' toast-leaving' : ''}`}
      onMouseEnter={() => onHoverChange(id, true)}
      onMouseLeave={() => onHoverChange(id, false)}
      onFocus={() => onFocusChange(id, true)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    >
      <svg className="toast-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <circle cx="10" cy="10" r="8" />
        <path d={ICON_PATHS[type]} />
      </svg>
      <span className="toast-message">{message}</span>
      <button type="button" className="toast-close" aria-label="Dismiss notification" onClick={() => onDismiss(id)}>
        <span aria-hidden="true">×</span>
      </button>
      <span
        key={generation}
        className="toast-progress"
        aria-hidden="true"
        style={{ '--toast-duration': `${duration}ms` } as CSSProperties}
      />
    </div>
  )
}

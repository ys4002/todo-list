import type { CSSProperties, FocusEvent, KeyboardEvent } from 'react'
import type { ToastData } from './notificationContext'

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

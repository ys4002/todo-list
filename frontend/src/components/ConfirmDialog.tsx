import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useModalDialog } from '../hooks/useModalDialog'

interface Props {
  title: string
  children?: ReactNode
  confirmLabel: string
  /** Visual only: 'danger' (default) for destructive actions, 'primary' otherwise. */
  tone?: 'danger' | 'primary'
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({ title, children, confirmLabel, tone = 'danger', onConfirm, onCancel }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  useModalDialog(onCancel)
  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  return (
    <div className="dialog-backdrop">
      <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="card dialog">
        <h2 id="confirm-title">{title}</h2>
        {children}
        <div className="dialog-actions">
          <button type="button" ref={cancelRef} className="ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className={tone} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

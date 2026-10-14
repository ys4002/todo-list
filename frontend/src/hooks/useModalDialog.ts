import { useEffect, useRef } from 'react'

/**
 * Closes a dialog on Escape and returns focus to the element that had it before the dialog opened.
 * While `closable` is false (a request is in flight) Escape is ignored.
 */
export function useModalDialog(onClose: () => void, closable = true) {
  // Captured during the first render, before the dialog moves focus (autoFocus runs at commit).
  const openerRef = useRef<Element | null>(document.activeElement)
  const onCloseRef = useRef(onClose)
  const closableRef = useRef(closable)
  useEffect(() => {
    onCloseRef.current = onClose
    closableRef.current = closable
  }, [onClose, closable])

  // Element focused inside the dialog when the effect last cleaned up (see below).
  const focusBeforeCleanupRef = useRef<Element | null>(null)

  useEffect(() => {
    // StrictMode's simulated unmount/remount runs cleanup and then setup again straight away: put focus back
    // where the dialog had it. After a real unmount setup never runs again, so this is a no-op in production.
    const resume = focusBeforeCleanupRef.current
    focusBeforeCleanupRef.current = null
    if (resume instanceof HTMLElement && resume.isConnected) resume.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && closableRef.current) onCloseRef.current()
    }
    const opener = openerRef.current
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      focusBeforeCleanupRef.current = document.activeElement
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [])
}

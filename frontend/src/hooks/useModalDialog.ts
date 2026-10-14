import { useEffect, useRef } from 'react'

/** Closes a dialog on Escape and returns focus to the element that had it before the dialog opened. */
export function useModalDialog(onClose: () => void) {
  // Captured during the first render, before the dialog moves focus (autoFocus runs at commit).
  const openerRef = useRef<Element | null>(document.activeElement)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
    }
    const opener = openerRef.current
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [])
}

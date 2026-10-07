import { useEffect, useState } from 'react'

/** Current time in ms, refreshed every `intervalMs` (default 60 s) so Overdue markers update live. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

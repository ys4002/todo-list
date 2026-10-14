import { useEffect, useRef, useState } from 'react'
import { adminApi } from '../api/adminApi'
import type { AdminUser } from '../api/types'
import { useNotifications } from '../notifications/notificationContext'
import { notifyMutationError } from '../notifications/notifyMutationError'
import { errorMessageOf } from '../utils/formErrors'

/** Users matching the search text. `toggleEnabled` updates the list locally on success. */
export function useAdminUsers(q: string) {
  const notify = useNotifications()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyIds, setBusyIds] = useState<ReadonlySet<number>>(() => new Set())
  const busyRef = useRef(new Set<number>())
  // The search text whose response has been handled; a different `q` means a fetch is in flight.
  const [settledQuery, setSettledQuery] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    adminApi
      .listUsers(q)
      .then((list) => {
        if (cancelled) return
        setUsers(list)
        setError(null)
      })
      .catch((e) => !cancelled && setError(errorMessageOf(e)))
      .finally(() => {
        if (cancelled) return
        setLoading(false)
        setSettledQuery(q)
      })
    return () => {
      cancelled = true
    }
  }, [q])

  async function toggleEnabled(target: AdminUser) {
    if (busyRef.current.has(target.id)) return
    busyRef.current.add(target.id)
    setBusyIds(new Set(busyRef.current))
    setError(null)
    try {
      const updated = await adminApi.setUserEnabled(target.id, !target.enabled)
      setUsers((current) => current.map((u) => (u.id === updated.id ? updated : u)))
    } catch (e) {
      notifyMutationError(notify, e)
    } finally {
      busyRef.current.delete(target.id)
      setBusyIds(new Set(busyRef.current))
    }
  }

  const refreshing = !loading && settledQuery !== q

  return { users, loading, refreshing, error, setError, busyIds, toggleEnabled }
}

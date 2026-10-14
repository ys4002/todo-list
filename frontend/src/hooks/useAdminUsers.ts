import { useEffect, useState } from 'react'
import { adminApi } from '../api/adminApi'
import type { AdminUser } from '../api/types'
import { errorMessageOf } from '../utils/formErrors'

/** Users matching the search text. `toggleEnabled` updates the list locally on success. */
export function useAdminUsers(q: string) {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [q])

  async function toggleEnabled(target: AdminUser) {
    setError(null)
    try {
      const updated = await adminApi.setUserEnabled(target.id, !target.enabled)
      setUsers((current) => current.map((u) => (u.id === updated.id ? updated : u)))
    } catch (e) {
      setError(errorMessageOf(e))
    }
  }

  return { users, loading, error, setError, toggleEnabled }
}

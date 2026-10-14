import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { adminApi } from '../api/adminApi'
import type { AdminUser } from '../api/types'
import TasksPanel from '../components/TasksPanel'
import NotFoundPage from './NotFoundPage'

export default function AdminUserTasksPage() {
  const { userId: userIdParam } = useParams()
  const userId = Number(userIdParam)
  const location = useLocation()
  const hintedUsername = (location.state as { username?: string } | null)?.username
  const [target, setTarget] = useState<AdminUser | null>(null)

  useEffect(() => {
    if (!Number.isInteger(userId)) return
    let cancelled = false
    adminApi
      .getUser(userId)
      .then((u) => !cancelled && setTarget(u))
      .catch(() => {}) // intentional: the header falls back to the hint; TasksPanel surfaces load errors
    return () => {
      cancelled = true
    }
  }, [userId])

  if (!Number.isInteger(userId)) return <NotFoundPage />

  const username = target?.username ?? hintedUsername ?? `user ${userId}`
  return (
    <>
      <p className="back-link">
        <Link to="/admin/users">← Back to users</Link>
      </p>
      <h1 className="page-heading">
        Tasks of {username} {target && !target.enabled && <span className="badge disabled">Disabled</span>}
      </h1>
      <TasksPanel scope={{ kind: 'admin', userId }} />
    </>
  )
}

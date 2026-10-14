import { Link } from 'react-router-dom'
import type { AdminUser } from '../api/types'
import Spinner from './Spinner'

interface Props {
  users: AdminUser[]
  currentUserId: number
  /** Users with an enable/disable request in flight. */
  busyIds: ReadonlySet<number>
  onToggleEnabled: (user: AdminUser) => void
  onResetPassword: (user: AdminUser) => void
}

export default function UserTable({ users, currentUserId, busyIds, onToggleEnabled, onResetPassword }: Props) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Username</th>
            <th>Name</th>
            <th>Role</th>
            <th>Status</th>
            <th>Tasks</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const isSelf = user.id === currentUserId
            const busy = busyIds.has(user.id)
            return (
              <tr key={user.id}>
                <td className="cell-username">{user.username}</td>
                <td>{user.name}</td>
                <td>{user.role}</td>
                <td>
                  <span className={user.enabled ? 'badge enabled' : 'badge disabled'}>
                    {user.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </td>
                <td className="cell-tasks">
                  {user.taskCount} total, {user.openTaskCount} open
                </td>
                <td className="row-actions">
                  <Link to={`/admin/users/${user.id}/tasks`} state={{ username: user.username }}>
                    View tasks
                  </Link>
                  <button
                    type="button"
                    className="ghost small"
                    disabled={isSelf || busy}
                    aria-busy={busy ? true : undefined}
                    title={isSelf ? 'You cannot disable your own account' : undefined}
                    aria-label={`${user.enabled ? 'Disable' : 'Enable'} ${user.username}`}
                    onClick={() => onToggleEnabled(user)}
                  >
                    {busy ? (
                      <>
                        <Spinner /> {user.enabled ? 'Disabling…' : 'Enabling…'}
                      </>
                    ) : user.enabled ? (
                      'Disable'
                    ) : (
                      'Enable'
                    )}
                  </button>
                  <button type="button" className="ghost small" disabled={busy} aria-label={`Reset password for ${user.username}`} onClick={() => onResetPassword(user)}>
                    Reset password
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

import { Link } from 'react-router-dom'
import type { AdminUser } from '../api/types'

interface Props {
  users: AdminUser[]
  currentUserId: number
  onToggleEnabled: (user: AdminUser) => void
  onResetPassword: (user: AdminUser) => void
}

export default function UserTable({ users, currentUserId, onToggleEnabled, onResetPassword }: Props) {
  return (
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
          return (
            <tr key={user.id}>
              <td>{user.username}</td>
              <td>{user.name}</td>
              <td>{user.role}</td>
              <td>
                <span className={user.enabled ? 'badge enabled' : 'badge disabled'}>
                  {user.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </td>
              <td>
                {user.taskCount} total, {user.openTaskCount} open
              </td>
              <td className="task-actions">
                <Link to={`/admin/users/${user.id}/tasks`} state={{ username: user.username }}>
                  View tasks
                </Link>
                <button
                  type="button"
                  disabled={isSelf}
                  title={isSelf ? 'You cannot disable your own account' : undefined}
                  aria-label={`${user.enabled ? 'Disable' : 'Enable'} ${user.username}`}
                  onClick={() => onToggleEnabled(user)}
                >
                  {user.enabled ? 'Disable' : 'Enable'}
                </button>
                <button type="button" aria-label={`Reset password for ${user.username}`} onClick={() => onResetPassword(user)}>
                  Reset password
                </button>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

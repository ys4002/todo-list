import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { initials } from '../utils/initials'

export default function AppHeader() {
  const { user, isAdmin, logout } = useAuth()
  return (
    <header className="app-header">
      <span className="brand">Todo</span>
      <nav aria-label="Main">
        <NavLink to="/tasks">My Tasks</NavLink>
        <NavLink to="/profile">Profile</NavLink>
        {isAdmin && <NavLink to="/admin/users">Users</NavLink>}
      </nav>
      <div className="header-user">
        <span className="avatar" aria-hidden="true">
          {initials(user?.name ?? '', user?.username ?? '')}
        </span>
        <span aria-label="Signed in as">{user?.username}</span>
        <button type="button" className="ghost small" onClick={() => logout()}>
          Logout
        </button>
      </div>
    </header>
  )
}

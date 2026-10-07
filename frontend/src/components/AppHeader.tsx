import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export default function AppHeader() {
  const { user, isAdmin, logout } = useAuth()
  return (
    <header className="app-header">
      <nav aria-label="Main">
        <NavLink to="/tasks">My Tasks</NavLink>
        <NavLink to="/profile">Profile</NavLink>
        {isAdmin && <NavLink to="/admin/users">Users</NavLink>}
      </nav>
      <div>
        <span aria-label="Signed in as">{user?.username}</span>{' '}
        <button type="button" onClick={() => logout()}>
          Logout
        </button>
      </div>
    </header>
  )
}

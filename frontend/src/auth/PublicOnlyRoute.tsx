import { Navigate, Outlet } from 'react-router-dom'
import { homePathFor, useAuth } from './AuthContext'

export default function PublicOnlyRoute() {
  const { user } = useAuth()
  if (user) return <Navigate to={homePathFor(user.role)} replace />
  return <Outlet />
}

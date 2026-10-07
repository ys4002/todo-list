import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './AuthContext'

export default function ProtectedRoute() {
  const { user, logoutReason } = useAuth()
  if (!user) return <Navigate to={logoutReason ? `/login?${logoutReason}=1` : '/login'} replace />
  return <Outlet />
}

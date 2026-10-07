import { Outlet } from 'react-router-dom'
import ForbiddenPage from '../pages/ForbiddenPage'
import { useAuth } from './AuthContext'

export default function AdminRoute() {
  const { isAdmin } = useAuth()
  return isAdmin ? <Outlet /> : <ForbiddenPage />
}

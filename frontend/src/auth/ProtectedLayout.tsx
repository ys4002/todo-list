import { Outlet } from 'react-router-dom'
import AppHeader from '../components/AppHeader'

export default function ProtectedLayout() {
  return (
    <>
      <AppHeader />
      <main className="container">
        <Outlet />
      </main>
    </>
  )
}

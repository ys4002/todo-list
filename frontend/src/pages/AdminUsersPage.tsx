import { useState } from 'react'
import type { AdminUser } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import ConfirmDialog from '../components/ConfirmDialog'
import ErrorBanner from '../components/ErrorBanner'
import ResetPasswordDialog from '../components/ResetPasswordDialog'
import SearchBox from '../components/SearchBox'
import UserTable from '../components/UserTable'
import { useAdminUsers } from '../hooks/useAdminUsers'
import { useDebouncedValue } from '../hooks/useDebouncedValue'

export default function AdminUsersPage() {
  const { user: me } = useAuth()
  const [searchText, setSearchText] = useState('')
  const q = useDebouncedValue(searchText.trim(), 300)
  const { users, loading, error, toggleEnabled } = useAdminUsers(q)
  const [notice, setNotice] = useState<string | null>(null)
  const [toggling, setToggling] = useState<AdminUser | null>(null)
  const [resetting, setResetting] = useState<AdminUser | null>(null)

  async function confirmToggle() {
    const target = toggling
    setToggling(null)
    if (!target) return
    setNotice(null)
    await toggleEnabled(target)
  }

  return (
    <>
      <h1>Users</h1>
      <section className="card">
        <SearchBox value={searchText} onChange={setSearchText} label="Search users" />
        <ErrorBanner message={error} />
        {notice && (
          <p role="status" className="success-banner">
            {notice}
          </p>
        )}
        {loading ? (
          <p role="status">Loading users…</p>
        ) : users.length === 0 ? (
          <p className="empty-state">{q ? 'No users match your search' : 'No users'}</p>
        ) : (
          <UserTable
            users={users}
            currentUserId={me?.id ?? -1}
            onToggleEnabled={setToggling}
            onResetPassword={(u) => {
              setNotice(null)
              setResetting(u)
            }}
          />
        )}
      </section>
      {toggling && (
        <ConfirmDialog
          title={toggling.enabled ? 'Disable user' : 'Enable user'}
          confirmLabel={toggling.enabled ? 'Disable' : 'Enable'}
          onCancel={() => setToggling(null)}
          onConfirm={confirmToggle}
        >
          <p>
            {toggling.enabled ? 'Disable' : 'Enable'} {toggling.username}?
          </p>
        </ConfirmDialog>
      )}
      {resetting && (
        <ResetPasswordDialog
          user={resetting}
          onClose={() => setResetting(null)}
          onSuccess={(username) => {
            setResetting(null)
            setNotice(`Password updated for ${username}`)
          }}
        />
      )}
    </>
  )
}

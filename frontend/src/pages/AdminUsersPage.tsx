import { useState } from 'react'
import type { AdminUser } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import ConfirmDialog from '../components/ConfirmDialog'
import EmptyState from '../components/EmptyState'
import ErrorBanner from '../components/ErrorBanner'
import LoadingSkeleton from '../components/LoadingSkeleton'
import ResetPasswordDialog from '../components/ResetPasswordDialog'
import SearchBox from '../components/SearchBox'
import UserTable from '../components/UserTable'
import { useAdminUsers } from '../hooks/useAdminUsers'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { useNotifications } from '../notifications/notificationContext'

export default function AdminUsersPage() {
  const { user: me } = useAuth()
  const [searchText, setSearchText] = useState('')
  const q = useDebouncedValue(searchText.trim(), 300)
  const { users, loading, refreshing, error, busyIds, toggleEnabled } = useAdminUsers(q)
  const notify = useNotifications()
  const [toggling, setToggling] = useState<AdminUser | null>(null)
  const [resetting, setResetting] = useState<AdminUser | null>(null)

  async function confirmToggle() {
    const target = toggling
    setToggling(null)
    if (!target) return
    await toggleEnabled(target)
  }

  return (
    <>
      <h1>Users</h1>
      <section className="card">
        <SearchBox value={searchText} onChange={setSearchText} label="Search users" busy={refreshing || searchText.trim() !== q} busyLabel="Updating users…" />
        <ErrorBanner message={error} />
        {loading ? (
          <LoadingSkeleton label="Loading users…" rows={4} variant="table" />
        ) : users.length === 0 ? (
          <EmptyState variant={q ? 'search' : 'users'} message={q ? 'No users match your search' : 'No users'} />
        ) : (
          <div aria-busy={refreshing} className={refreshing ? 'is-refreshing' : undefined}>
            <UserTable
              users={users}
              currentUserId={me?.id ?? -1}
              busyIds={busyIds}
              onToggleEnabled={setToggling}
              onResetPassword={setResetting}
            />
          </div>
        )}
      </section>
      {toggling && (
        <ConfirmDialog
          title={toggling.enabled ? 'Disable user' : 'Enable user'}
          confirmLabel={toggling.enabled ? 'Disable' : 'Enable'}
          tone={toggling.enabled ? 'danger' : 'primary'}
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
            notify.success(`Password updated for ${username}`)
          }}
        />
      )}
    </>
  )
}

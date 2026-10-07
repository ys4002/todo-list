import { useEffect, useState } from 'react'
import { adminApi } from '../api/adminApi'
import type { AdminUser } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import ConfirmDialog from '../components/ConfirmDialog'
import ErrorBanner from '../components/ErrorBanner'
import ResetPasswordDialog from '../components/ResetPasswordDialog'
import SearchBox from '../components/SearchBox'
import UserTable from '../components/UserTable'
import { useDebouncedValue } from '../hooks/useDebouncedValue'

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong')

export default function AdminUsersPage() {
  const { user: me } = useAuth()
  const [searchText, setSearchText] = useState('')
  const q = useDebouncedValue(searchText.trim(), 300)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [toggling, setToggling] = useState<AdminUser | null>(null)
  const [resetting, setResetting] = useState<AdminUser | null>(null)

  useEffect(() => {
    let cancelled = false
    adminApi
      .listUsers(q)
      .then((list) => {
        if (cancelled) return
        setUsers(list)
        setError(null)
      })
      .catch((e) => !cancelled && setError(messageOf(e)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [q])

  async function confirmToggle() {
    const target = toggling
    setToggling(null)
    if (!target) return
    setError(null)
    setNotice(null)
    try {
      const updated = await adminApi.setUserEnabled(target.id, !target.enabled)
      setUsers((current) => current.map((u) => (u.id === updated.id ? updated : u)))
    } catch (e) {
      setError(messageOf(e))
    }
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

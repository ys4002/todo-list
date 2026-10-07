import { useAuth } from '../auth/AuthContext'
import ChangePasswordForm from '../components/ChangePasswordForm'

export default function ProfilePage() {
  const { user } = useAuth()
  if (!user) return null
  return (
    <>
      <section className="card">
        <h1>Profile</h1>
        <dl className="profile-details">
          <dt>Username</dt>
          <dd>{user.username}</dd>
          <dt>Name</dt>
          <dd>{user.name}</dd>
          <dt>Role</dt>
          <dd>{user.role}</dd>
          <dt>Member since</dt>
          <dd>{new Date(user.createdAt).toLocaleDateString(undefined, { dateStyle: 'long' })}</dd>
        </dl>
      </section>
      <section className="card">
        <ChangePasswordForm username={user.username} />
      </section>
    </>
  )
}

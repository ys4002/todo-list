import { Link } from 'react-router-dom'

export default function ForbiddenPage() {
  return (
    <section className="card centered-card">
      <h1>Access denied</h1>
      <p>You do not have permission to view this page.</p>
      <Link to="/" className="button-link">Go to my home page</Link>
    </section>
  )
}

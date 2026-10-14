import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <section className="card centered-card">
      <h1>Page not found</h1>
      <Link to="/" className="button-link">Go to my home page</Link>
    </section>
  )
}

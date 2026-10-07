import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiRequestError } from '../api/apiClient'
import { homePathFor, useAuth } from '../auth/AuthContext'
import ErrorBanner from '../components/ErrorBanner'
import FormField from '../components/FormField'
import { validateLogin } from '../utils/validation'
import type { FieldErrors, LoginField } from '../utils/validation'

const DISABLED_TEXT = 'Your account is disabled. Contact the administrator.'

const notices: { param: string; text: string; error: boolean }[] = [
  { param: 'registered', text: 'Registration successful. Please log in.', error: false },
  { param: 'expired', text: 'Your session has expired. Please log in again.', error: true },
  { param: 'disabled', text: DISABLED_TEXT, error: true },
  { param: 'passwordChanged', text: 'Your password was changed. Please log in again.', error: true },
]

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [values, setValues] = useState<Record<LoginField, string>>({ username: '', password: '' })
  const [errors, setErrors] = useState<FieldErrors<LoginField>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    const clientErrors = validateLogin(values)
    setErrors(clientErrors)
    if (Object.keys(clientErrors).length > 0) return

    setPending(true)
    try {
      const user = await login(values.username.trim(), values.password)
      navigate(homePathFor(user.role), { replace: true })
    } catch (error) {
      setPending(false)
      if (error instanceof ApiRequestError && error.status === 403) setFormError(DISABLED_TEXT)
      else setFormError(error instanceof Error ? error.message : 'Something went wrong')
    }
  }

  const notice = notices.find((n) => params.has(n.param))

  return (
    <main className="container">
      <form className="card auth-card" onSubmit={handleSubmit} noValidate aria-label="Log in">
        <h1>Log in</h1>
        {notice &&
          (notice.error ? (
            <ErrorBanner message={notice.text} />
          ) : (
            <p role="status" className="success-banner">
              {notice.text}
            </p>
          ))}
        <ErrorBanner message={formError} />
        <FormField
          id="username"
          label="Username"
          autoComplete="username"
          value={values.username}
          onValueChange={(username) => setValues((v) => ({ ...v, username }))}
          error={errors.username}
        />
        <FormField
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          value={values.password}
          onValueChange={(password) => setValues((v) => ({ ...v, password }))}
          error={errors.password}
        />
        <button type="submit" className="primary" disabled={pending}>
          Log in
        </button>
        <p>
          No account? <Link to="/register">Register</Link>
        </p>
      </form>
    </main>
  )
}

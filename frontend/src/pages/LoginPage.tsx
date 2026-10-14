import { useLayoutEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiRequestError } from '../api/apiClient'
import { DISABLED_MESSAGE, homePathFor, useAuth } from '../auth/AuthContext'
import AuthLayout from '../components/AuthLayout'
import ErrorBanner from '../components/ErrorBanner'
import FormField from '../components/FormField'
import Spinner from '../components/Spinner'
import { useNotifications } from '../notifications/notificationContext'
import type { NotificationType } from '../notifications/notificationContext'
import { errorMessageOf } from '../utils/formErrors'
import { validateLogin } from '../utils/validation'
import type { FieldErrors, LoginField } from '../utils/validation'

const DISABLED_TEXT = 'Your account is disabled. Contact the administrator.'

const notices: { param: string; text: string; type: NotificationType }[] = [
  { param: 'registered', text: 'Registration successful. Please log in.', type: 'success' },
  { param: 'expired', text: 'Your session has expired. Please log in again.', type: 'info' },
  { param: 'disabled', text: DISABLED_TEXT, type: 'error' },
  { param: 'passwordChanged', text: 'Your password was changed. Please log in again.', type: 'info' },
]

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const notify = useNotifications()
  const [values, setValues] = useState<Record<LoginField, string>>({ username: '', password: '' })
  const [errors, setErrors] = useState<FieldErrors<LoginField>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const notice = notices.find((n) => params.has(n.param))
  // Arriving here ends any session, so earlier toasts are cleared first. The notice is shown as a toast on arrival
  // (layout effect: it must be in the DOM in the same commit, as the inline banner was); dismissed when leaving
  // /login so it does not follow the user to /tasks.
  useLayoutEffect(() => {
    notify.clear()
    if (!notice) return
    const id = notify[notice.type](notice.text)
    return () => notify.dismiss(id)
  }, [notice, notify])

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
      if (error instanceof ApiRequestError && (error.status === 403 || error.message === DISABLED_MESSAGE)) {
        setFormError(DISABLED_TEXT)
      } else {
        setFormError(errorMessageOf(error))
      }
    }
  }

  return (
    <AuthLayout>
      <form className="card auth-card" onSubmit={handleSubmit} noValidate aria-label="Log in">
        <h1>Log in</h1>
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
        <button type="submit" className="primary block" disabled={pending} aria-busy={pending ? true : undefined}>
          {pending ? (
            <>
              <Spinner /> Logging in…
            </>
          ) : (
            'Log in'
          )}
        </button>
        <p>
          No account? <Link to="/register">Register</Link>
        </p>
      </form>
    </AuthLayout>
  )
}

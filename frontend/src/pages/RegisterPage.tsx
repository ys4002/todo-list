import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiRequestError } from '../api/apiClient'
import { authApi } from '../api/authApi'
import AuthLayout from '../components/AuthLayout'
import ErrorBanner from '../components/ErrorBanner'
import FormField from '../components/FormField'
import PasswordRulesChecklist from '../components/PasswordRulesChecklist'
import { BusyLabel } from '../components/Spinner'
import { errorMessageOf, fieldErrorsFrom } from '../utils/formErrors'
import { validateRegister } from '../utils/validation'
import type { FieldErrors, RegisterField } from '../utils/validation'

const fields: RegisterField[] = ['username', 'name', 'password', 'confirmPassword']

export default function RegisterPage() {
  const navigate = useNavigate()
  const [values, setValues] = useState<Record<RegisterField, string>>({
    username: '',
    name: '',
    password: '',
    confirmPassword: '',
  })
  const [errors, setErrors] = useState<FieldErrors<RegisterField>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const setField = (field: RegisterField) => (value: string) => setValues((v) => ({ ...v, [field]: value }))

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    const clientErrors = validateRegister(values)
    setErrors(clientErrors)
    if (Object.keys(clientErrors).length > 0) return

    setPending(true)
    try {
      await authApi.register({
        username: values.username.trim(),
        name: values.name.trim(),
        password: values.password,
        confirmPassword: values.confirmPassword,
      })
      navigate('/login?registered=1')
    } catch (error) {
      setValues((v) => ({ ...v, password: '', confirmPassword: '' }))
      if (error instanceof ApiRequestError && error.status === 409) {
        setErrors({ username: error.message })
      } else if (error instanceof ApiRequestError && error.fieldErrors.length > 0) {
        const serverErrors = fieldErrorsFrom(error, fields)
        setErrors(serverErrors)
        if (Object.keys(serverErrors).length === 0) setFormError(error.message)
      } else {
        setErrors({})
        setFormError(errorMessageOf(error))
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthLayout>
      <form className="card auth-card" onSubmit={handleSubmit} noValidate aria-label="Register">
        <h1>Create account</h1>
        <ErrorBanner message={formError} />
        <FormField
          id="username"
          label="Username"
          autoComplete="username"
          value={values.username}
          onValueChange={setField('username')}
          error={errors.username}
        />
        <FormField
          id="name"
          label="Name"
          autoComplete="name"
          value={values.name}
          onValueChange={setField('name')}
          error={errors.name}
        />
        <FormField
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          value={values.password}
          onValueChange={setField('password')}
          error={errors.password}
        />
        <PasswordRulesChecklist password={values.password} username={values.username} />
        <FormField
          id="confirmPassword"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={values.confirmPassword}
          onValueChange={setField('confirmPassword')}
          error={errors.confirmPassword}
        />
        <button type="submit" className="primary block" disabled={pending} aria-busy={pending ? true : undefined}>
          <BusyLabel busy={pending} busyText="Registering…">
            Register
          </BusyLabel>
        </button>
        <p>
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </form>
    </AuthLayout>
  )
}

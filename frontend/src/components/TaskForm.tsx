import { useState } from 'react'
import type { FormEvent } from 'react'
import { ApiRequestError } from '../api/apiClient'
import type { Task, TaskUpdateRequest } from '../api/types'
import { nowAsDateTimeLocalValue, toDateTimeLocalValue, toIsoUtc } from '../utils/dateUtils'
import { errorMessageOf, fieldErrorsFrom } from '../utils/formErrors'
import { validateTask } from '../utils/validation'
import type { FieldErrors, TaskField } from '../utils/validation'
import ErrorBanner from './ErrorBanner'
import FormField from './FormField'
import Spinner from './Spinner'

interface Props {
  /** Present in edit mode. */
  task?: Task
  onSubmit: (request: TaskUpdateRequest) => Promise<void>
  onCancel: () => void
}

const taskFields: TaskField[] = ['title', 'description', 'dueAt']

export default function TaskForm({ task, onSubmit, onCancel }: Props) {
  const mode = task ? 'edit' : 'create'
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [dueAtLocal, setDueAtLocal] = useState(task ? toDateTimeLocalValue(task.dueAt) : '')
  const [completed, setCompleted] = useState(task?.completed ?? false)
  const [errors, setErrors] = useState<FieldErrors<TaskField>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    const clientErrors = validateTask({ title, description, dueAtLocal }, mode)
    setErrors(clientErrors)
    if (Object.keys(clientErrors).length > 0) return

    setPending(true)
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim() === '' ? null : description,
        dueAt: toIsoUtc(dueAtLocal),
        completed,
      })
    } catch (error) {
      setPending(false)
      if (error instanceof ApiRequestError && error.fieldErrors.length > 0) {
        const serverErrors = fieldErrorsFrom(error, taskFields)
        setErrors(serverErrors)
        if (Object.keys(serverErrors).length === 0) setFormError(error.message)
      } else {
        setFormError(errorMessageOf(error))
      }
    }
  }

  return (
    <form className="card task-form" onSubmit={handleSubmit} noValidate aria-busy={pending ? true : undefined} aria-label={mode === 'edit' ? 'Edit task' : 'New task'}>
      <h2>{mode === 'edit' ? 'Edit task' : 'New task'}</h2>
      <ErrorBanner message={formError} />
      <FormField id="task-title" label="Title" value={title} onValueChange={setTitle} error={errors.title} />
      <div className="field">
        <label htmlFor="task-description">Description</label>
        <textarea
          id="task-description"
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={errors.description ? 'task-description-error' : undefined}
        />
        {errors.description && (
          <span id="task-description-error" role="alert" className="field-error">
            {errors.description}
          </span>
        )}
      </div>
      <div className="form-row">
        <FormField
          id="task-due"
          label="Due date and time"
          type="datetime-local"
          min={mode === 'create' ? nowAsDateTimeLocalValue() : undefined}
          value={dueAtLocal}
          onValueChange={setDueAtLocal}
          error={errors.dueAt}
        />
        {mode === 'edit' && (
          <div className="field">
            <label className="checkbox-label">
              <input type="checkbox" checked={completed} onChange={(event) => setCompleted(event.target.checked)} /> Completed
            </label>
          </div>
        )}
      </div>
      <div className="form-actions">
        <button type="submit" className="primary" disabled={pending} aria-busy={pending ? true : undefined}>
          {pending ? (
            <>
              <Spinner /> {mode === 'edit' ? 'Saving…' : 'Adding…'}
            </>
          ) : mode === 'edit' ? (
            'Save'
          ) : (
            'Add task'
          )}
        </button>
        <button type="button" className="ghost" disabled={pending} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

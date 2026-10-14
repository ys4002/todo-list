import type { Task } from '../api/types'
import { formatDueAt, isOverdue } from '../utils/dateUtils'
import Spinner from './Spinner'

export type RowBusy = 'saving' | 'deleting' | null

interface Props {
  task: Task
  now: number
  /** Pending completion value, present only while it differs from the saved one. */
  staged?: boolean
  busy: RowBusy
  /** The edit form is open for this task. */
  editing: boolean
  /** The last Save failed. */
  saveFailed: boolean
  onStage: (task: Task, completed: boolean) => void
  onSave: (task: Task) => void
  onClear: (task: Task) => void
  onEdit: (task: Task) => void
  onDelete: (task: Task) => void
}

export const taskCheckboxId = (taskId: number) => `task-check-${taskId}`

export default function TaskItem({ task, now, staged, busy, editing, saveFailed, onStage, onSave, onClear, onEdit, onDelete }: Props) {
  const overdue = isOverdue(task, now)
  const hasStaged = staged !== undefined
  const locked = busy !== null || editing
  const chipId = `task-staged-${task.id}`
  return (
    <li
      className={`task-item${task.completed ? ' completed' : ''}${overdue ? ' overdue' : ''}`}
      aria-busy={busy !== null ? true : undefined}
    >
      <input
        id={taskCheckboxId(task.id)}
        type="checkbox"
        checked={staged ?? task.completed}
        disabled={locked}
        aria-label={`Mark '${task.title}' as completed`}
        aria-describedby={hasStaged ? chipId : undefined}
        onChange={(event) => onStage(task, event.target.checked)}
      />
      <div className="task-body">
        <div className="task-title">{task.title}</div>
        {task.description && <div className="task-description">{task.description}</div>}
        <div className="task-meta">
          Due {formatDueAt(task.dueAt)} {overdue && <span className="badge overdue">Overdue</span>}{' '}
          {hasStaged && (
            <span id={chipId} className="badge unsaved">
              Unsaved change
            </span>
          )}
        </div>
        {saveFailed && (
          <div role="alert" className="task-error">
            Not saved. Try again.
          </div>
        )}
      </div>
      <div className="task-actions">
        {hasStaged && (
          <>
            <button
              type="button"
              className="primary small task-save"
              disabled={locked}
              aria-busy={busy === 'saving' ? true : undefined}
              aria-label={`Save completion change for '${task.title}'`}
              onClick={() => onSave(task)}
            >
              {busy === 'saving' ? (
                <>
                  <Spinner /> Saving…
                </>
              ) : (
                'Save'
              )}
            </button>
            <button
              type="button"
              className="ghost small task-clear"
              disabled={locked}
              aria-label={`Discard completion change for '${task.title}'`}
              onClick={() => onClear(task)}
            >
              Clear
            </button>
          </>
        )}
        <button type="button" className="ghost small" disabled={locked} onClick={() => onEdit(task)} aria-label={`Edit '${task.title}'`}>
          {editing ? 'Editing' : 'Edit'}
        </button>
        <button
          type="button"
          className="ghost danger small"
          disabled={locked}
          aria-busy={busy === 'deleting' ? true : undefined}
          onClick={() => onDelete(task)}
          aria-label={`Delete '${task.title}'`}
        >
          {busy === 'deleting' ? (
            <>
              <Spinner /> Deleting…
            </>
          ) : (
            'Delete'
          )}
        </button>
      </div>
    </li>
  )
}

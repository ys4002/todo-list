import { useEffect, useRef, useState } from 'react'
import type { Task, TaskScope, TaskStatus } from '../api/types'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { useNow } from '../hooks/useNow'
import { useTasks } from '../hooks/useTasks'
import ConfirmDialog from './ConfirmDialog'
import ErrorBanner from './ErrorBanner'
import LoadingSkeleton from './LoadingSkeleton'
import SearchBox from './SearchBox'
import TaskFilterTabs from './TaskFilterTabs'
import TaskForm from './TaskForm'
import TaskList from './TaskList'
import { taskCheckboxId } from './TaskItem'

type FormState = null | { kind: 'create' } | { kind: 'edit'; task: Task }

const without = <K, V>(map: ReadonlyMap<K, V>, key: K) => {
  const next = new Map(map)
  next.delete(key)
  return next
}
const withoutId = (ids: ReadonlySet<number>, id: number) => {
  const next = new Set(ids)
  next.delete(id)
  return next
}

/** Filter + search + list + form. Used by "My Tasks" and by the admin's per-user task page. */
export default function TasksPanel({ scope }: { scope: TaskScope }) {
  const [status, setStatus] = useState<TaskStatus>('all')
  const [searchText, setSearchText] = useState('')
  const q = useDebouncedValue(searchText.trim(), 300)
  const { tasks, loading, refreshing, error, busyIds, create, update, setCompleted, remove } = useTasks(scope, status, q)
  const now = useNow()
  const [form, setForm] = useState<FormState>(null)
  const [deleting, setDeleting] = useState<Task | null>(null)
  const [deletingIds, setDeletingIds] = useState<ReadonlySet<number>>(() => new Set())
  // Pending completion changes (task id -> desired value). Kept only in memory; nothing is sent until Save.
  const [staged, setStaged] = useState<ReadonlyMap<number, boolean>>(() => new Map())
  const [saveFailedIds, setSaveFailedIds] = useState<ReadonlySet<number>>(() => new Set())
  const [announcement, setAnnouncement] = useState('')
  const [focusRequest, setFocusRequest] = useState<{ taskId: number } | null>(null)
  const listRegionRef = useRef<HTMLDivElement>(null)

  // After Save or Clear: focus the task's checkbox, or the list when the task left the current filter.
  useEffect(() => {
    if (!focusRequest) return
    const checkbox = document.getElementById(taskCheckboxId(focusRequest.taskId))
    ;(checkbox ?? listRegionRef.current)?.focus()
  }, [focusRequest])

  const updatingList = refreshing || searchText.trim() !== q
  const rowBusy = (taskId: number) => (deletingIds.has(taskId) ? 'deleting' : busyIds.has(taskId) ? 'saving' : null)

  function dropStaged(taskId: number) {
    setStaged((current) => without(current, taskId))
    setSaveFailedIds((current) => withoutId(current, taskId))
  }

  function stage(task: Task, completed: boolean) {
    setSaveFailedIds((current) => withoutId(current, task.id))
    if (completed === task.completed) setStaged((current) => without(current, task.id))
    else setStaged((current) => new Map(current).set(task.id, completed))
  }

  function clear(task: Task) {
    dropStaged(task.id)
    setAnnouncement(`Change discarded for '${task.title}'`)
    setFocusRequest({ taskId: task.id })
  }

  async function save(task: Task) {
    const completed = staged.get(task.id)
    if (completed === undefined) return
    setSaveFailedIds((current) => withoutId(current, task.id))
    try {
      await setCompleted(task, completed)
    } catch {
      // The hook already showed the toast. The change stays staged and the row says so.
      setSaveFailedIds((current) => new Set(current).add(task.id))
      return
    }
    dropStaged(task.id)
    setAnnouncement(`'${task.title}' marked as ${completed ? 'completed' : 'not completed'}`)
    setFocusRequest({ taskId: task.id })
  }

  async function confirmDelete(task: Task) {
    setDeleting(null)
    setDeletingIds((current) => new Set(current).add(task.id))
    const deleted = await remove(task)
    setDeletingIds((current) => withoutId(current, task.id))
    if (deleted) dropStaged(task.id)
  }

  return (
    <section className="card">
      <div className="panel-toolbar">
        <TaskFilterTabs value={status} onChange={setStatus} />
        <SearchBox value={searchText} onChange={setSearchText} label="Search tasks" busy={updatingList} busyLabel="Updating tasks…" />
        {!form && (
          <button type="button" className="primary" onClick={() => setForm({ kind: 'create' })}>
            Add task
          </button>
        )}
      </div>
      <ErrorBanner message={error} />
      {form && (
        <TaskForm
          key={form.kind === 'edit' ? form.task.id : 'new'}
          // The form starts from the staged value so a pending change is not lost.
          task={form.kind === 'edit' ? { ...form.task, completed: staged.get(form.task.id) ?? form.task.completed } : undefined}
          onCancel={() => setForm(null)}
          onSubmit={async (request) => {
            if (form.kind === 'edit') {
              await update(form.task.id, request)
              dropStaged(form.task.id)
            } else await create({ title: request.title, description: request.description, dueAt: request.dueAt })
            setForm(null)
          }}
        />
      )}
      <p role="status" aria-live="polite" className="visually-hidden">
        {announcement}
      </p>
      {loading ? (
        <LoadingSkeleton label="Loading tasks…" rows={4} variant="list" />
      ) : (
        <div
          ref={listRegionRef}
          role="group"
          aria-label="Tasks"
          tabIndex={-1}
          aria-busy={updatingList}
          className={`task-list-region${updatingList ? ' is-refreshing' : ''}`}
        >
          <TaskList
            tasks={tasks}
            now={now}
            searching={q !== ''}
            staged={staged}
            saveFailedIds={saveFailedIds}
            editingId={form?.kind === 'edit' ? form.task.id : null}
            rowBusy={rowBusy}
            onStage={stage}
            onSave={save}
            onClear={clear}
            onEdit={(task) => setForm({ kind: 'edit', task })}
            onDelete={setDeleting}
          />
        </div>
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete task"
          confirmLabel="Delete"
          onCancel={() => setDeleting(null)}
          onConfirm={() => void confirmDelete(deleting)}
        >
          <p>Delete “{deleting.title}”? This cannot be undone.</p>
        </ConfirmDialog>
      )}
    </section>
  )
}

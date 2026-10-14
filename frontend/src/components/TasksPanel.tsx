import { useState } from 'react'
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

type FormState = null | { kind: 'create' } | { kind: 'edit'; task: Task }

/** Filter + search + list + form. Used by "My Tasks" and by the admin's per-user task page. */
export default function TasksPanel({ scope }: { scope: TaskScope }) {
  const [status, setStatus] = useState<TaskStatus>('all')
  const [searchText, setSearchText] = useState('')
  const q = useDebouncedValue(searchText.trim(), 300)
  const { tasks, loading, error, create, update, toggle, remove } = useTasks(scope, status, q)
  const now = useNow()
  const [form, setForm] = useState<FormState>(null)
  const [deleting, setDeleting] = useState<Task | null>(null)

  return (
    <section className="card">
      <div className="panel-toolbar">
        <TaskFilterTabs value={status} onChange={setStatus} />
        <SearchBox value={searchText} onChange={setSearchText} label="Search tasks" />
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
          task={form.kind === 'edit' ? form.task : undefined}
          onCancel={() => setForm(null)}
          onSubmit={async (request) => {
            if (form.kind === 'edit') await update(form.task.id, request)
            else await create({ title: request.title, description: request.description, dueAt: request.dueAt })
            setForm(null)
          }}
        />
      )}
      {loading ? (
        <LoadingSkeleton label="Loading tasks…" rows={4} variant="list" />
      ) : (
        <TaskList
          tasks={tasks}
          now={now}
          searching={q !== ''}
          onToggle={toggle}
          onEdit={(task) => setForm({ kind: 'edit', task })}
          onDelete={setDeleting}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete task"
          confirmLabel="Delete"
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            const task = deleting
            setDeleting(null)
            void remove(task)
          }}
        >
          <p>Delete “{deleting.title}”? This cannot be undone.</p>
        </ConfirmDialog>
      )}
    </section>
  )
}

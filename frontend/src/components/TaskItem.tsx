import type { Task } from '../api/types'
import { formatDueAt, isOverdue } from '../utils/dateUtils'

interface Props {
  task: Task
  now: number
  onToggle: (task: Task) => void
  onEdit: (task: Task) => void
  onDelete: (task: Task) => void
}

export default function TaskItem({ task, now, onToggle, onEdit, onDelete }: Props) {
  const overdue = isOverdue(task, now)
  return (
    <li className={task.completed ? 'task-item completed' : 'task-item'}>
      <input
        type="checkbox"
        checked={task.completed}
        aria-label={`Mark '${task.title}' as completed`}
        onChange={() => onToggle(task)}
      />
      <div className="task-body">
        <div className="task-title">{task.title}</div>
        {task.description && <div className="task-description">{task.description}</div>}
        <div className="task-meta">
          Due {formatDueAt(task.dueAt)} {overdue && <span className="badge overdue">Overdue</span>}
        </div>
      </div>
      <div className="task-actions">
        <button type="button" onClick={() => onEdit(task)} aria-label={`Edit '${task.title}'`}>
          Edit
        </button>
        <button type="button" className="danger" onClick={() => onDelete(task)} aria-label={`Delete '${task.title}'`}>
          Delete
        </button>
      </div>
    </li>
  )
}

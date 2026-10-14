import type { Task } from '../api/types'
import EmptyState from './EmptyState'
import TaskItem from './TaskItem'
import type { RowBusy } from './TaskItem'

interface Props {
  tasks: Task[]
  now: number
  searching: boolean
  staged: ReadonlyMap<number, boolean>
  saveFailedIds: ReadonlySet<number>
  editingId: number | null
  rowBusy: (taskId: number) => RowBusy
  onStage: (task: Task, completed: boolean) => void
  onSave: (task: Task) => void
  onClear: (task: Task) => void
  onEdit: (task: Task) => void
  onDelete: (task: Task) => void
}

export default function TaskList({ tasks, searching, staged, saveFailedIds, editingId, rowBusy, ...itemProps }: Props) {
  if (tasks.length === 0) {
    return <EmptyState variant={searching ? 'search' : 'tasks'} message={searching ? 'No tasks match your search' : 'No tasks yet'} />
  }
  return (
    <ul className="task-list">
      {tasks.map((task) => (
        <TaskItem
          key={task.id}
          task={task}
          staged={staged.get(task.id)}
          busy={rowBusy(task.id)}
          editing={editingId === task.id}
          saveFailed={saveFailedIds.has(task.id)}
          {...itemProps}
        />
      ))}
    </ul>
  )
}

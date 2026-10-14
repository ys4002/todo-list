import type { Task } from '../api/types'
import EmptyState from './EmptyState'
import TaskItem from './TaskItem'

interface Props {
  tasks: Task[]
  now: number
  searching: boolean
  onToggle: (task: Task) => void
  onEdit: (task: Task) => void
  onDelete: (task: Task) => void
}

export default function TaskList({ tasks, searching, ...itemProps }: Props) {
  if (tasks.length === 0) {
    return <EmptyState variant={searching ? 'search' : 'tasks'} message={searching ? 'No tasks match your search' : 'No tasks yet'} />
  }
  return (
    <ul className="task-list">
      {tasks.map((task) => (
        <TaskItem key={task.id} task={task} {...itemProps} />
      ))}
    </ul>
  )
}

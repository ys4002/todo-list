import TasksPanel from '../components/TasksPanel'

export default function TasksPage() {
  return (
    <>
      <h1>My Tasks</h1>
      <TasksPanel scope={{ kind: 'own' }} />
    </>
  )
}

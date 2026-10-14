import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { tasksApi } from '../api/tasksApi'
import { useNotifications } from '../notifications/notificationContext'
import { notifyMutationError } from '../notifications/notifyMutationError'
import { errorMessageOf } from '../utils/formErrors'
import type { Task, TaskCreateRequest, TaskScope, TaskStatus, TaskUpdateRequest } from '../api/types'

function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort(
    (a, b) => a.dueAt.localeCompare(b.dueAt) || a.createdAt.localeCompare(b.createdAt),
  )
}

function matchesFilter(task: Task, status: TaskStatus, q: string): boolean {
  if (status === 'active' && task.completed) return false
  if (status === 'completed' && !task.completed) return false
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  return `${task.title}\n${task.description ?? ''}`.toLowerCase().includes(needle)
}

/** Tasks for a scope, filtered by status and search text. Mutations update the list locally. */
export function useTasks(scope: TaskScope, status: TaskStatus, q: string) {
  const userId = scope.kind === 'admin' ? scope.userId : undefined
  const stableScope = useMemo<TaskScope>(
    () => (userId === undefined ? { kind: 'own' } : { kind: 'admin', userId }),
    [userId],
  )
  const notify = useNotifications()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const filterRef = useRef({ status, q })
  useEffect(() => {
    filterRef.current = { status, q }
  }, [status, q])

  useEffect(() => {
    let cancelled = false
    tasksApi
      .list(stableScope, { status, q })
      .then((list) => {
        if (cancelled) return
        setTasks(list)
        setError(null)
      })
      .catch((e) => !cancelled && setError(errorMessageOf(e)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [stableScope, status, q])

  /** Insert/replace a server task, or drop it when it no longer matches the current filter. */
  const applyServerTask = useCallback((task: Task) => {
    const { status: s, q: query } = filterRef.current
    setTasks((current) => {
      const rest = current.filter((t) => t.id !== task.id)
      return matchesFilter(task, s, query) ? sortTasks([...rest, task]) : rest
    })
  }, [])

  const create = useCallback(
    async (request: TaskCreateRequest) => applyServerTask(await tasksApi.create(stableScope, request)),
    [stableScope, applyServerTask],
  )

  const update = useCallback(
    async (id: number, request: TaskUpdateRequest) =>
      applyServerTask(await tasksApi.update(stableScope, id, request)),
    [stableScope, applyServerTask],
  )

  const toggle = useCallback(
    async (task: Task) => {
      const completed = !task.completed
      setError(null)
      setTasks((current) => current.map((t) => (t.id === task.id ? { ...t, completed } : t)))
      try {
        applyServerTask(await tasksApi.setCompleted(stableScope, task.id, completed))
      } catch (e) {
        setTasks((current) => current.map((t) => (t.id === task.id ? task : t)))
        notifyMutationError(notify, e)
      }
    },
    [stableScope, applyServerTask, notify],
  )

  const remove = useCallback(
    async (task: Task) => {
      setError(null)
      try {
        await tasksApi.remove(stableScope, task.id)
        setTasks((current) => current.filter((t) => t.id !== task.id))
      } catch (e) {
        notifyMutationError(notify, e)
      }
    },
    [stableScope, notify],
  )

  return { tasks, loading, error, create, update, toggle, remove }
}

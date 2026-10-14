import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiRequestError } from '../api/apiClient'
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
  const [busyIds, setBusyIds] = useState<ReadonlySet<number>>(() => new Set())
  const busyRef = useRef(new Set<number>())
  // Bumped by every successful mutation. A list response that started before a mutation finished is stale (B2).
  const mutationSeq = useRef(0)
  const [reloadKey, setReloadKey] = useState(0)
  // The request key whose list response has been handled; a different current key means a fetch is in flight.
  const [settledKey, setSettledKey] = useState('')
  const requestKey = `${userId ?? 'own'}|${status}|${q}|${reloadKey}`
  const filterRef = useRef({ status, q })
  useEffect(() => {
    filterRef.current = { status, q }
  }, [status, q])

  useEffect(() => {
    let cancelled = false
    const seqAtStart = mutationSeq.current
    tasksApi
      .list(stableScope, { status, q })
      .then((list) => {
        if (cancelled) return
        if (seqAtStart !== mutationSeq.current) {
          setReloadKey((key) => key + 1)
          return
        }
        setTasks(list)
        setError(null)
        setLoading(false)
        setSettledKey(requestKey)
      })
      .catch((e) => {
        if (cancelled) return
        setError(errorMessageOf(e))
        setLoading(false)
        setSettledKey(requestKey)
      })
    return () => {
      cancelled = true
    }
  }, [stableScope, status, q, requestKey])

  const markBusy = useCallback((id: number, on: boolean) => {
    if (on) busyRef.current.add(id)
    else busyRef.current.delete(id)
    setBusyIds(new Set(busyRef.current))
  }, [])

  /** Insert/replace a server task, or drop it when it no longer matches the current filter. */
  const applyServerTask = useCallback((task: Task) => {
    const { status: s, q: query } = filterRef.current
    setTasks((current) => {
      const rest = current.filter((t) => t.id !== task.id)
      return matchesFilter(task, s, query) ? sortTasks([...rest, task]) : rest
    })
  }, [])

  const create = useCallback(
    async (request: TaskCreateRequest) => {
      const created = await tasksApi.create(stableScope, request)
      mutationSeq.current += 1
      applyServerTask(created)
    },
    [stableScope, applyServerTask],
  )

  const update = useCallback(
    async (id: number, request: TaskUpdateRequest) => {
      const saved = await tasksApi.update(stableScope, id, request)
      mutationSeq.current += 1
      applyServerTask(saved)
    },
    [stableScope, applyServerTask],
  )

  /** Not optimistic: the row stays busy until the server answers. Failures show the toast and are rethrown. Resolves false if a request for this task is already running. */
  const setCompleted = useCallback(
    async (task: Task, completed: boolean) => {
      if (busyRef.current.has(task.id)) return false
      markBusy(task.id, true)
      setError(null)
      try {
        const saved = await tasksApi.setCompleted(stableScope, task.id, completed)
        mutationSeq.current += 1
        applyServerTask(saved)
        return true
      } catch (e) {
        if (e instanceof ApiRequestError && e.status === 404) setTasks((current) => current.filter((t) => t.id !== task.id))
        notifyMutationError(notify, e)
        throw e
      } finally {
        markBusy(task.id, false)
      }
    },
    [stableScope, applyServerTask, notify, markBusy],
  )

  /** Resolves true when the task was deleted. */
  const remove = useCallback(
    async (task: Task) => {
      if (busyRef.current.has(task.id)) return false
      markBusy(task.id, true)
      setError(null)
      try {
        await tasksApi.remove(stableScope, task.id)
        mutationSeq.current += 1
        setTasks((current) => current.filter((t) => t.id !== task.id))
        return true
      } catch (e) {
        notifyMutationError(notify, e)
        return false
      } finally {
        markBusy(task.id, false)
      }
    },
    [stableScope, notify, markBusy],
  )

  const refreshing = !loading && settledKey !== requestKey

  return { tasks, loading, refreshing, error, busyIds, create, update, setCompleted, remove }
}

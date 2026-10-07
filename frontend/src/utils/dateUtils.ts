const pad = (value: number) => String(value).padStart(2, '0')

/** `datetime-local` value (browser local time, no offset) -> ISO-8601 UTC instant. */
export function toIsoUtc(localValue: string): string {
  return new Date(localValue).toISOString()
}

/** ISO instant -> `YYYY-MM-DDTHH:mm` in the browser's local time, for `datetime-local`. */
export function toDateTimeLocalValue(iso: string): string {
  const date = new Date(iso)
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

/** Current local time as a `datetime-local` value (used for the `min` attribute). */
export function nowAsDateTimeLocalValue(now: number = Date.now()): string {
  return toDateTimeLocalValue(new Date(now).toISOString())
}

export function formatDueAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function isOverdue(task: { dueAt: string; completed: boolean }, now: number = Date.now()): boolean {
  return !task.completed && new Date(task.dueAt).getTime() < now
}

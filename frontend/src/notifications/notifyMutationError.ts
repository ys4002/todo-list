import { ApiRequestError } from '../api/apiClient'
import { errorMessageOf } from '../utils/formErrors'
import type { Notifications } from './notificationContext'

/**
 * Shows a failed mutation as an error toast. A 401 is skipped: the session handler already redirects
 * to /login?expired=1 or ?disabled=1, which shows its own notice.
 */
export function notifyMutationError(notify: Notifications, error: unknown) {
  if (error instanceof ApiRequestError && error.status === 401) return
  notify.error(errorMessageOf(error))
}

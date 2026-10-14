import type { ApiErrorBody, FieldErrorDetail } from './types'

export interface ApiHandlers {
  getToken: () => string | null
  onTokenRenewed: (token: string, expiresInSeconds: number) => void
  onUnauthorized: (message: string) => void
}

const noop: ApiHandlers = {
  getToken: () => null,
  onTokenRenewed: () => {},
  onUnauthorized: () => {},
}

let handlers: ApiHandlers = noop

export function configureApiClient(next: Partial<ApiHandlers>): void {
  handlers = { ...noop, ...next }
}

export class ApiRequestError extends Error {
  readonly status: number
  readonly fieldErrors: FieldErrorDetail[]

  constructor(status: number, message: string, fieldErrors: FieldErrorDetail[] = []) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.fieldErrors = fieldErrors
  }

  /** First message for a field, if the server reported one. */
  fieldMessage(field: string): string | undefined {
    return this.fieldErrors.find((e) => e.field === field)?.message
  }
}

export interface RequestOptions {
  /** Skip the global 401 handler (used by login, where 401 means bad credentials). */
  skipUnauthorizedHandler?: boolean
  /** Do not send the bearer token (public endpoints reject a stale token with 401). */
  anonymous?: boolean
}

export function buildQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, value)
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

/** Build-time backend origin (public config, never a secret). Empty keeps relative `/api` URLs. */
function apiBaseUrl(): string {
  const base = import.meta.env.VITE_API_BASE_URL as string | undefined
  return (base ?? '').trim().replace(/\/+$/, '')
}

export async function apiRequest<T>(
  method: string,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = options.anonymous ? null : handlers.getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  let response: Response
  try {
    response = await fetch(apiBaseUrl() + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiRequestError(0, 'Network error')
  }

  const renewedToken = response.headers.get('X-Auth-Token')
  const expiresIn = Number(response.headers.get('X-Auth-Expires-In'))
  if (renewedToken && Number.isFinite(expiresIn) && expiresIn > 0) {
    handlers.onTokenRenewed(renewedToken, expiresIn)
  }

  if (!response.ok) {
    const error = await parseError(response)
    if (response.status === 401 && !options.skipUnauthorizedHandler) {
      handlers.onUnauthorized(error.message)
    }
    throw error
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

async function parseError(response: Response): Promise<ApiRequestError> {
  try {
    const data = (await response.json()) as Partial<ApiErrorBody>
    return new ApiRequestError(
      response.status,
      data.message ?? `Request failed (${response.status})`,
      Array.isArray(data.fieldErrors) ? data.fieldErrors : [],
    )
  } catch {
    return new ApiRequestError(response.status, `Request failed (${response.status})`)
  }
}

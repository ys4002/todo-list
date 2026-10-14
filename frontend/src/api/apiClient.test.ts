import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError, apiRequest, configureApiClient } from './apiClient'
import { tasksApi } from './tasksApi'

function mockFetch(response: Response | Error) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    if (response instanceof Error) throw response
    return response
  })
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

describe('apiClient (U18)', () => {
  const onTokenRenewed = vi.fn()
  const onUnauthorized = vi.fn()

  beforeEach(() => {
    onTokenRenewed.mockReset()
    onUnauthorized.mockReset()
    configureApiClient({ getToken: () => 'tok', onTokenRenewed, onUnauthorized })
  })

  it('sends the bearer token and JSON body', async () => {
    const spy = mockFetch(json({ ok: true }))
    await apiRequest('POST', '/api/x', { a: 1 })
    const [url, init] = spy.mock.calls[0]
    expect(url).toBe('/api/x')
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer tok', 'Content-Type': 'application/json' })
    expect(init?.body).toBe('{"a":1}')
  })

  it('omits the bearer token for anonymous requests', async () => {
    const spy = mockFetch(json({}))
    await apiRequest('POST', '/api/auth/login', {}, { anonymous: true })
    expect(spy.mock.calls[0][1]?.headers).not.toHaveProperty('Authorization')
  })

  it('reports renewed tokens from response headers', async () => {
    mockFetch(json([], 200, { 'X-Auth-Token': 'new', 'X-Auth-Expires-In': '3600' }))
    await apiRequest('GET', '/api/tasks')
    expect(onTokenRenewed).toHaveBeenCalledWith('new', 3600)
  })

  it('reports renewed tokens even on error responses', async () => {
    mockFetch(json({ message: 'Task not found', fieldErrors: [] }, 404, { 'X-Auth-Token': 'n2', 'X-Auth-Expires-In': '3600' }))
    await expect(apiRequest('GET', '/api/tasks/1')).rejects.toBeInstanceOf(ApiRequestError)
    expect(onTokenRenewed).toHaveBeenCalledWith('n2', 3600)
  })

  it('calls onUnauthorized with the message on 401', async () => {
    mockFetch(json({ message: 'Account is disabled', fieldErrors: [] }, 401))
    await expect(apiRequest('GET', '/api/tasks')).rejects.toMatchObject({ status: 401 })
    expect(onUnauthorized).toHaveBeenCalledWith('Account is disabled')
  })

  it('does not call onUnauthorized when skipped', async () => {
    mockFetch(json({ message: 'Invalid username or password', fieldErrors: [] }, 401))
    await expect(
      apiRequest('POST', '/api/auth/login', {}, { skipUnauthorizedHandler: true }),
    ).rejects.toThrow('Invalid username or password')
    expect(onUnauthorized).not.toHaveBeenCalled()
  })

  it('does not log out on 403', async () => {
    mockFetch(json({ message: 'Access denied', fieldErrors: [] }, 403))
    await expect(apiRequest('GET', '/api/admin/users')).rejects.toMatchObject({ status: 403, message: 'Access denied' })
    expect(onUnauthorized).not.toHaveBeenCalled()
  })

  it('parses 400 fieldErrors', async () => {
    mockFetch(json({ message: 'Validation failed', fieldErrors: [{ field: 'title', message: 'Title is required' }] }, 400))
    const error = (await apiRequest('POST', '/api/tasks', {}).catch((e) => e)) as ApiRequestError
    expect(error.fieldErrors).toEqual([{ field: 'title', message: 'Title is required' }])
    expect(error.fieldMessage('title')).toBe('Title is required')
  })

  it('returns undefined for 204', async () => {
    mockFetch(new Response(null, { status: 204 }))
    await expect(apiRequest('DELETE', '/api/tasks/1')).resolves.toBeUndefined()
  })

  it('maps network failure to "Network error"', async () => {
    mockFetch(new TypeError('Failed to fetch'))
    await expect(apiRequest('GET', '/api/tasks')).rejects.toMatchObject({ status: 0, message: 'Network error' })
  })
})

describe('tasksApi scope', () => {
  beforeEach(() => configureApiClient({}))

  it('uses /api/tasks for own scope and omits status=all and blank q', async () => {
    const spy = mockFetch(json([]))
    await tasksApi.list({ kind: 'own' }, { status: 'all', q: '  ' })
    expect(spy.mock.calls[0][0]).toBe('/api/tasks')
  })

  it('uses the admin path with status and q', async () => {
    const spy = mockFetch(json([]))
    await tasksApi.list({ kind: 'admin', userId: 2 }, { status: 'active', q: 'milk' })
    expect(spy.mock.calls[0][0]).toBe('/api/admin/users/2/tasks?status=active&q=milk')
  })
})

describe('API base URL and vercel.json (F-T7..F-T9)', () => {
  beforeEach(() => configureApiClient({ getToken: () => 'tok' }))
  afterEach(() => vi.unstubAllEnvs())

  it('F-T7: keeps the relative URL when VITE_API_BASE_URL is empty', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '')
    const spy = mockFetch(json([]))
    await apiRequest('GET', '/api/tasks')
    expect(spy.mock.calls[0][0]).toBe('/api/tasks')
  })

  it('F-T8: prefixes the base URL, trims a trailing slash, keeps auth header and default credentials', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com/')
    const spy = mockFetch(json([]))
    await apiRequest('GET', '/api/tasks')
    const [url, init] = spy.mock.calls[0]
    expect(url).toBe('https://api.example.com/api/tasks')
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer tok' })
    expect(init?.credentials).toBeUndefined()
  })

  it('F-T9: vercel.json has exactly one SPA rewrite to /index.html', () => {
    const config = JSON.parse(readFileSync(resolve(__dirname, '../../vercel.json'), 'utf8'))
    expect(config.rewrites).toEqual([{ source: '/(.*)', destination: '/index.html' }])
  })
})

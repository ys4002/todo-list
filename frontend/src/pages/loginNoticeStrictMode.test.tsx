import { act, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../App'
import { AuthProvider } from '../auth/AuthContext'
import { mockApi } from '../qa/qaUtils'

afterEach(() => vi.useRealTimers())

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

// DEF-1: StrictMode (npm run dev) runs effect cleanups and re-runs effects, which left a stuck, duplicate toast.
describe('login notice under StrictMode', () => {
  it.each(['expired=1', 'registered=1'])('/login?%s shows one toast, which auto-dismisses and leaves nothing behind', async (query) => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
    mockApi({})
    render(
      <StrictMode>
        <MemoryRouter initialEntries={[`/login?${query}`]}>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </MemoryRouter>
      </StrictMode>,
    )
    await advance(300)
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(document.querySelectorAll('.toast-leaving')).toHaveLength(0)
    await advance(5000)
    expect(screen.queryByRole('status')).toBeNull()
    expect(document.querySelectorAll('.toast')).toHaveLength(0)
  })
})

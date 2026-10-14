import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { json, mockApi, renderApp, seedSession } from '../qa/qaUtils'

describe('loading skeleton', () => {
  it('announces the loading text, hides the skeleton and exposes no list items while pending', () => {
    seedSession('USER')
    mockApi({ 'GET /api/tasks': () => new Promise<Response>(() => {}) })
    renderApp('/tasks')
    expect(screen.getByText('Loading tasks…')).toHaveAttribute('role', 'status')
    expect(document.querySelector('.skeleton')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })
})

describe('header avatar', () => {
  it('keeps the signed-in label to the username and hides the avatar chip', async () => {
    seedSession('USER')
    mockApi({ 'GET /api/tasks': json([]) })
    renderApp('/tasks')
    expect(screen.getByLabelText('Signed in as')).toHaveTextContent(/^alice_01$/)
    const avatar = document.querySelector('.avatar')
    expect(avatar).toHaveAttribute('aria-hidden', 'true')
    expect(avatar).toHaveTextContent('AS')
    await screen.findByText('No tasks yet')
  })
})

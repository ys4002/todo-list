import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { alice, apiError, bodyOf, callsTo, EXPIRES_KEY, json, mockApi, renderApp, seedSession, TOKEN_KEY, where } from './qaUtils'

const STRENGTH =
  'Password must be 8-64 characters with no spaces and include an upper-case letter, a lower-case letter, a digit and a special character'

const type = (label: string, text: string) => userEvent.type(screen.getByLabelText(label), text)
const submit = () => userEvent.click(screen.getByRole('button', { name: 'Change password' }))

describe('QA Profile UI31-UI34', () => {
  it('UI31 shows username, name, role, member since and the change-password form; header has Profile link', async () => {
    seedSession('USER')
    mockApi({})
    renderApp('/profile')
    expect(await screen.findByRole('form', { name: 'Change password' })).toBeInTheDocument()
    const details = document.querySelector('dl')!
    expect(details).toHaveTextContent('alice_01')
    expect(details).toHaveTextContent('Alice Smith')
    expect(details).toHaveTextContent('USER')
    expect(details).toHaveTextContent('2026')
    expect(screen.getByRole('link', { name: 'Profile' })).toBeInTheDocument()
  })

  it('UI31 logged out redirects to /login', async () => {
    mockApi({})
    renderApp('/profile')
    await waitFor(() => expect(where()).toBe('/login'))
  })

  it('UI32 empty submit shows messages and sends nothing', async () => {
    seedSession('USER')
    const spy = mockApi({})
    renderApp('/profile')
    await submit()
    expect(screen.getByText('Current password is required')).toBeInTheDocument()
    expect(screen.getByText(STRENGTH)).toBeInTheDocument()
    expect(screen.getByText('Confirm new password is required')).toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()
  })

  it('UI32 weak new password, mismatch and new = current', async () => {
    seedSession('USER')
    const spy = mockApi({})
    renderApp('/profile')
    await type('Current password', 'Str0ng!Pass')
    await type('New password', 'weak')
    await type('Confirm new password', 'weak')
    await submit()
    expect(screen.getByText(STRENGTH)).toBeInTheDocument()

    await userEvent.clear(screen.getByLabelText('New password'))
    await userEvent.clear(screen.getByLabelText('Confirm new password'))
    await type('New password', 'N3w#Secret')
    await type('Confirm new password', 'N3w#Other1')
    await submit()
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument()

    await userEvent.clear(screen.getByLabelText('New password'))
    await userEvent.clear(screen.getByLabelText('Confirm new password'))
    await type('New password', 'Str0ng!Pass')
    await type('Confirm new password', 'Str0ng!Pass')
    await submit()
    expect(screen.getByText('New password must be different from the current password')).toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()
  })

  it('UI32 checklist shows failing rules, including the username rule', async () => {
    seedSession('USER')
    mockApi({})
    renderApp('/profile')
    await type('New password', 'xalice_01')
    const rules = screen.getByRole('list', { name: 'Password rules' })
    expect(rules.querySelectorAll('li[data-met="false"]').length).toBeGreaterThan(0)
    expect(screen.getByText(/does not contain the username/i).closest('li')).toHaveAttribute('data-met', 'false')
  })

  it('UI33 wrong current password: field error, still logged in, still on /profile', async () => {
    seedSession('USER')
    mockApi({
      'PUT /api/auth/password': apiError(400, 'Validation failed', [
        { field: 'currentPassword', message: 'Current password is incorrect' },
      ]),
    })
    renderApp('/profile')
    await type('Current password', 'Wr0ng!Passw')
    await type('New password', 'N3w#Secret')
    await type('Confirm new password', 'N3w#Secret')
    await submit()
    expect(await screen.findByText('Current password is incorrect')).toBeInTheDocument()
    expect(where()).toBe('/profile')
    expect(localStorage.getItem(TOKEN_KEY)).toBe('stored-token')
    expect(screen.getByRole('button', { name: 'Logout' })).toBeInTheDocument()
  })

  it('UI34 success: banner, cleared fields, new token stored, still logged in', async () => {
    seedSession('USER')
    const spy = mockApi({
      'PUT /api/auth/password': json({ token: 'fresh-token', tokenType: 'Bearer', expiresIn: 3600, user: alice }),
    })
    renderApp('/profile')
    await type('Current password', 'Str0ng!Pass')
    await type('New password', 'N3w#Secret')
    await type('Confirm new password', 'N3w#Secret')
    await submit()
    expect(await screen.findByText('Password changed')).toBeInTheDocument()
    expect(screen.getByLabelText('Current password')).toHaveValue('')
    expect(screen.getByLabelText('New password')).toHaveValue('')
    expect(screen.getByLabelText('Confirm new password')).toHaveValue('')
    expect(localStorage.getItem(TOKEN_KEY)).toBe('fresh-token')
    expect(Number(localStorage.getItem(EXPIRES_KEY))).toBeGreaterThan(Date.now() + 3_500_000)
    expect(where()).toBe('/profile')
    expect(bodyOf(spy, 'PUT', '/api/auth/password')).toEqual({
      currentPassword: 'Str0ng!Pass', newPassword: 'N3w#Secret', confirmNewPassword: 'N3w#Secret',
    })
    expect(callsTo(spy, 'PUT', '/api/auth/password')).toHaveLength(1)
  })
})

import { fireEvent, render, screen } from '@testing-library/react'
import { StrictMode, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { AdminUser } from '../api/types'
import ConfirmDialog from './ConfirmDialog'
import ResetPasswordDialog from './ResetPasswordDialog'

const user = { id: 1, username: 'alice' } as AdminUser

function ResetHarness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      {open && <ResetPasswordDialog user={user} onClose={() => setOpen(false)} onSuccess={vi.fn()} />}
    </>
  )
}

function ConfirmHarness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      {open && (
        <ConfirmDialog title="Sure?" confirmLabel="Yes" onConfirm={vi.fn()} onCancel={() => setOpen(false)} />
      )}
    </>
  )
}

describe('dialog initial focus and focus restore under StrictMode', () => {
  it('ResetPasswordDialog focuses New password, then restores the opener on close', () => {
    render(
      <StrictMode>
        <ResetHarness />
      </StrictMode>,
    )
    const opener = screen.getByRole('button', { name: 'Open' })
    opener.focus()
    fireEvent.click(opener)
    expect(screen.getByLabelText('New password')).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(opener).toHaveFocus()
  })

  it('ConfirmDialog focuses Cancel, then restores the opener on close', () => {
    render(
      <StrictMode>
        <ConfirmHarness />
      </StrictMode>,
    )
    const opener = screen.getByRole('button', { name: 'Open' })
    opener.focus()
    fireEvent.click(opener)
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(opener).toHaveFocus()
  })
})

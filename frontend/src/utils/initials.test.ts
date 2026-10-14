import { describe, expect, it } from 'vitest'
import { initials } from './initials'

describe('initials', () => {
  it('uses the first and last word', () => {
    expect(initials('Alice Smith')).toBe('AS')
    expect(initials('  alice   b   smith  ')).toBe('AS')
  })

  it('uses one letter for a single word', () => {
    expect(initials('alice_01')).toBe('A')
  })

  it('falls back to the username when the name is blank', () => {
    expect(initials('', 'alice_01')).toBe('A')
    expect(initials('   ', 'bob')).toBe('B')
    expect(initials('')).toBe('')
  })
})

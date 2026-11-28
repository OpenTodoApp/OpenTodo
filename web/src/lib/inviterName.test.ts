import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { inviterName, UNNAMED_INVITER } from './inviterName'

describe('inviterName (#2178)', () => {
  it('keeps a name and gives the label for none', () => {
    expect(inviterName('Alice')).toBe('Alice')
    expect(inviterName('')).toBe('The owner of this server')
    expect(inviterName('  ')).toBe('The owner of this server')
    expect(inviterName(UNNAMED_INVITER)).toBe('The owner of this server')
  })

  it('matches the label the server sends', () => {
    const src = readFileSync(new URL('../../../internal/auth/invitations.go', import.meta.url), 'utf8')
    expect(src).toContain(`return "${UNNAMED_INVITER}"`)
  })
})

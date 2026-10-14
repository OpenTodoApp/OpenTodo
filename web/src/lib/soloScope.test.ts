// isSoloScope (task-detail-redesign D3): when the viewer is the only assignable person.
import { describe, expect, it } from 'vitest'
import { isSoloScope } from './sharing'
import type { Membership, ProjectMember } from './types'

const member = (userId: string): ProjectMember => ({ userId, name: userId, email: `${userId}@example.com`, role: 'editor' } as ProjectMember)
const shared = (projectId: string, ...ids: string[]): Membership => ({ projectId, role: 'admin', ownerId: ids[0], members: ids.map(member) })

describe('isSoloScope', () => {
  const memberships = new Map<string, Membership>([
    ['solo', shared('solo', 'me')],
    ['team', shared('team', 'me', 'ana')],
  ])
  it('is true for the Inbox and an unshared project', () => {
    expect(isSoloScope(null, memberships, 'me')).toBe(true)
    expect(isSoloScope('private', memberships, 'me')).toBe(true)
  })
  it('is true for a shared project whose only member is the viewer', () => {
    expect(isSoloScope('solo', memberships, 'me')).toBe(true)
  })
  it('is false for a shared project with two members, and without a signed-in user', () => {
    expect(isSoloScope('team', memberships, 'me')).toBe(false)
    expect(isSoloScope(null, memberships, null)).toBe(false)
  })
})

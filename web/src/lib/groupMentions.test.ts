// Group mentions on the device (OpenSpec change group-mentions, design D4).
import { describe, expect, it } from 'vitest'
import { GROUP_MENTION_PREFIX, isGroupMention, mentionCandidates, mentionTargets, mentionToken } from './comments'
import type { Membership, WorkspaceGroup } from './types'

const memberships = new Map<string, Membership>([
  ['house', { projectId: 'house', role: 'owner', members: [
    { userId: 'me', name: 'Me', email: 'me@example.com', role: 'owner' },
    { userId: 'anna', name: 'Anna', email: 'anna@example.com', role: 'editor' },
    { userId: 'bob', name: 'Bob', email: 'bob@example.com', role: 'editor' },
  ] } as Membership],
])
const groups: WorkspaceGroup[] = [
  { id: 'g-adults', workspaceId: 'w-family', name: 'Adults', members: ['me', 'anna', 'bob', 'carol'] },
  { id: 'g-kids', workspaceId: 'w-family', name: 'Kids', members: ['dan'] },
  { id: 'g-solo', workspaceId: 'w-family', name: 'Only me', members: ['me'] },
  { id: 'g-team', workspaceId: 'w-work', name: 'Team', members: ['anna'] },
]
const ws = (id: string) => (id === 'house' ? 'w-family' : 'w-personal')

describe('mentionTargets', () => {
  it('lists the members, then the groups of the project workspace that reach someone else on the project', () => {
    const t = mentionTargets('house', memberships, groups, ws, 'me')
    expect(t.map((m) => m.userId)).toEqual(['me', 'anna', 'bob', `${GROUP_MENTION_PREFIX}g-adults`])
    // Carol is in Adults but not on the project: she is not counted.
    expect(t[3]).toMatchObject({ name: 'Adults', email: '', group: { size: 3 } })
  })

  it('offers nothing for a personal task', () => {
    expect(mentionTargets(null, memberships, groups, ws, 'me')).toEqual([])
    expect(mentionTargets('garden', memberships, groups, ws, 'me')).toEqual([])
  })

  it('tells group ids apart and gives a group a token like a person', () => {
    expect(isGroupMention('group:g1')).toBe(true)
    expect(isGroupMention('anna')).toBe(false)
    expect(mentionToken({ name: 'Side projects', email: '' })).toBe('Sideprojects')
  })
})

describe('mentionCandidates', () => {
  const t = mentionTargets('house', memberships, groups, ws, 'me')
  it('ranks people first, then groups, never the writer', () => {
    expect(mentionCandidates(t, 'a', 'me').map((m) => m.name)).toEqual(['Anna', 'Adults'])
    expect(mentionCandidates(t, '', 'me').map((m) => m.name)).toEqual(['Anna', 'Bob', 'Adults'])
    expect(mentionCandidates(t, 'adu', 'me').map((m) => m.name)).toEqual(['Adults'])
  })
})

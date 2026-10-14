import { describe, expect, it } from 'vitest'
import type { Project } from '../lib/types'
import { moveTargets } from './ProjectHeader'
import { match } from '../ui/Combobox/match'

const p = (id: string, name: string, parent_id: string | null = null, extra: Partial<Project> = {}): Project =>
  ({ id, name, color: '#22c55e', position: 1, archived: false, parent_id, created_at: 0, deleted_at: null, _clock: {}, ...extra } as Project)

const all = [
  p('home', 'Home'), p('kitchen', 'Kitchen', 'home'), p('tiles', 'Tiles', 'kitchen'),
  p('work', 'Work'), p('market', 'Marketing', 'work'), p('mark2', 'Market research', 'market'),
  p('old', 'Old stuff', null, { archived: true }), p('gone', 'Gone', null, { deleted_at: 1 }),
]

describe('project "Move to" targets (labels-and-menus 3.2)', () => {
  it('never lists the project itself, its descendants, archived or deleted projects', () => {
    const ids = moveTargets(all[0], all).map((t) => t.id)
    expect(ids).toEqual(['', 'work', 'market', 'mark2'])
  })

  it('offers "Top level" first and gives each candidate its parent path', () => {
    const t = moveTargets(all[2], all)
    expect(t[0]).toEqual({ id: '', name: 'Top level', path: [] })
    expect(t.find((x) => x.id === 'mark2')?.path).toEqual(['Work', 'Marketing'])
    expect(t.find((x) => x.id === 'kitchen')?.path).toEqual(['Home'])
  })
})

// The picker filters with the shared matcher: typing "mark" keeps only the matches.
describe('picker filtering', () => {
  it('"mark" matches Marketing and Market research only, each shown with its path', () => {
    const hits = moveTargets(all[0], all).filter((t) => match('mark', t.name, t.path.join(' / ')).tier > 0)
    expect(hits.map((t) => `${t.path.join(' / ')} › ${t.name}`)).toEqual(['Work › Marketing', 'Work / Marketing › Market research'])
  })
})

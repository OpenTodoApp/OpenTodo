// The registry's own rules (OpenSpec change ux-overhaul, keyboard-shortcuts
// "Conflicts fail the build"): no two entries bind the same keys in one scope, or
// in a scope and an ancestor scope, without an explicit override; every row the
// sheet and the guide show comes from the registry; the resolved bindings hold.
import { describe, expect, it } from 'vitest'
import { chordKey, chordsOf, keysOf, listedShortcuts, matchesChord, parseChord, parseKeys, SCOPE_ANCESTORS, sequencesClash, type Shortcut, SHORTCUT_SECTIONS, SHORTCUTS, VIEW_SCOPES } from './shortcuts'

/** Whether entries `a` and `b` can be active at the same time, given their scopes and views. */
function canMeet(a: Shortcut, b: Shortcut): boolean {
  const views = (s: Shortcut) => (s.scope === 'view' ? s.views ?? Object.keys(VIEW_SCOPES) : null)
  const va = views(a), vb = views(b)
  if (va && vb) return va.some((v) => vb.includes(v))
  // A `view` entry meets a deeper entry only in a view that hosts that scope.
  if (va) return va.some((v) => (VIEW_SCOPES[v] ?? []).includes(b.scope)) || ['global', 'vim'].includes(b.scope)
  if (vb) return vb.some((v) => (VIEW_SCOPES[v] ?? []).includes(a.scope)) || ['global', 'vim'].includes(a.scope)
  return true
}

/** Pairs of dispatched entries that bind the same chord while both can be active, without an override either way. */
export function conflicts(table: Shortcut[] = SHORTCUTS): string[] {
  const out: string[] = []
  const bound = table.filter((s) => !s.note && !s.local)
  for (let i = 0; i < bound.length; i++) {
    for (let j = i + 1; j < bound.length; j++) {
      const a = bound[i], b = bound[j]
      const same = a.scope === b.scope
      const related = same || SCOPE_ANCESTORS[a.scope].includes(b.scope) || SCOPE_ANCESTORS[b.scope].includes(a.scope)
      if (!related || !canMeet(a, b)) continue
      const shared = chordsOf(b).filter((cb) => chordsOf(a).some((ca) => sequencesClash(ca, cb))).map(chordKey)
      if (!shared.length) continue
      if (a.overrides?.includes(b.id) || b.overrides?.includes(a.id)) continue
      out.push(`"${a.id}" (${a.scope}) and "${b.id}" (${b.scope}) both bind ${shared.join(', ')}`)
    }
  }
  return out
}

describe('registry shape', () => {
  it('ids are unique and every section exists', () => {
    const ids = SHORTCUTS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    const sections = new Set(SHORTCUT_SECTIONS.map((s) => s.id))
    for (const s of SHORTCUTS) expect(sections.has(s.section), s.id).toBe(true)
  })

  it('every key of a dispatched entry parses; notes never do', () => {
    for (const s of SHORTCUTS) {
      if (s.note) continue
      for (const k of s.keys) expect(parseKeys(k), `${s.id}: ${k}`).not.toBeNull()
    }
    for (const s of SHORTCUTS.filter((x) => x.note)) expect(s.keys.some((k) => parseKeys(k) === null), s.id).toBe(true)
  })

  it('overrides name existing entries that bind the same keys', () => {
    for (const s of SHORTCUTS) {
      for (const id of s.overrides ?? []) {
        const other = SHORTCUTS.find((x) => x.id === id)
        expect(other, `${s.id} overrides unknown ${id}`).toBeTruthy()
        expect(chordsOf(other!).some((c) => chordsOf(s).some((m) => sequencesClash(m, c))), `${s.id} overrides ${id} but they share no keys`).toBe(true)
      }
    }
  })

  it('a `view` entry names views the router has', () => {
    for (const s of SHORTCUTS) for (const v of s.views ?? []) expect(v in VIEW_SCOPES, `${s.id}: ${v}`).toBe(true)
  })
})

describe('conflicts fail the build', () => {
  it('the resolved table has none', () => {
    expect(conflicts()).toEqual([])
  })

  it('names both entries of a duplicate binding (Shift+S for Skip in the list while Share holds it in the project view)', () => {
    const dup: Shortcut = { id: 'list.skip-dup', keys: ['Shift+S'], description: 'Skip occurrence', section: 'tasks', scope: 'list' }
    const found = conflicts([...SHORTCUTS, dup])
    expect(found).toHaveLength(1)
    expect(found[0]).toContain('"project.share"')
    expect(found[0]).toContain('"list.skip-dup"')
  })

  it('names a duplicate within one scope, and accepts it with an override', () => {
    const dup: Shortcut = { id: 'list.other-c', keys: ['c'], description: 'x', section: 'tasks', scope: 'list' }
    expect(conflicts([...SHORTCUTS, dup])).toEqual([expect.stringContaining('"list.complete"')])
    expect(conflicts([...SHORTCUTS, { ...dup, overrides: ['list.complete'] }])).toEqual([])
  })

  it('a view entry and a list entry only clash in a view that hosts a list', () => {
    const trash: Shortcut = { id: 'trash.c', keys: ['c'], description: 'x', section: 'trash', scope: 'view', views: ['trash'] }
    expect(conflicts([...SHORTCUTS, trash])).toEqual([])
    const project: Shortcut = { id: 'project.c', keys: ['c'], description: 'x', section: 'tasks', scope: 'view', views: ['project'] }
    expect(conflicts([...SHORTCUTS, project])).toEqual([expect.stringContaining('"list.complete"')])
  })
})

describe('resolved bindings (keyboard-shortcuts "Resolved conflicts")', () => {
  it('Shift+S is Share project only, Skip occurrence is Shift+K in the list and panel scopes', () => {
    const shiftS = SHORTCUTS.filter((s) => !s.note && s.keys.includes('Shift+S'))
    expect(shiftS.map((s) => s.id)).toEqual(['project.share'])
    expect(keysOf('list.skip')).toBe('Shift+K')
    expect(keysOf('panel.skip')).toBe('Shift+K')
  })
  it('s is Schedule in a list, Save in the Filter view and g s for Settings', () => {
    expect(keysOf('list.schedule')).toBe('s')
    expect(keysOf('filter.save')).toBe('s')
    expect(keysOf('go.settings')).toBe('g s')
  })
  it('. is the row menu or the Actions menu, a adds a subtask in a list and a card in a board column', () => {
    expect(keysOf('list.actions')).toBe('.')
    expect(keysOf('global.row-menu')).toContain('.')
    expect(keysOf('list.add-subtask')).toBe('a')
    expect(keysOf('board.add')).toBe('a')
    expect(SHORTCUTS.find((s) => s.id === 'board.add')?.overrides).toContain('list.add-subtask')
  })
})

describe('chords', () => {
  const ev = (key: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) => ({ key, ...mods })
  it('parses modifiers, named keys and symbols', () => {
    expect(parseChord('Shift+K')).toMatchObject({ key: 'k', shift: true, ctrl: false })
    expect(parseChord('K')).toMatchObject({ key: 'k', shift: true })
    expect(parseChord('⌘+K')).toMatchObject({ key: 'k', ctrl: 'meta' })
    expect(parseChord('Alt+Shift+↑')).toMatchObject({ key: 'arrowup', alt: true, shift: true })
    expect(parseChord('?')).toMatchObject({ key: '?', symbol: true })
    expect(parseChord('Space')).toMatchObject({ key: ' ' })
    expect(parseKeys('g Shift+I')).toHaveLength(2)
    expect(parseKeys('Drag (touch: press and hold)')).toBeNull()
  })
  it('matches key presses, ignoring Shift on symbols and requiring it on capitals', () => {
    expect(matchesChord(parseChord('Shift+K')!, ev('K', { shiftKey: true }))).toBe(true)
    expect(matchesChord(parseChord('k')!, ev('K', { shiftKey: true }))).toBe(false)
    expect(matchesChord(parseChord('?')!, ev('?', { shiftKey: true }))).toBe(true)
    expect(matchesChord(parseChord('Ctrl+K')!, ev('k', { ctrlKey: true }))).toBe(true)
    expect(matchesChord(parseChord('Ctrl+K')!, ev('k', { metaKey: true }))).toBe(false)
    expect(matchesChord(parseChord('j')!, ev('j', { altKey: true }))).toBe(false)
    expect(matchesChord(parseChord('Esc')!, ev('Escape'))).toBe(true)
  })
})

describe('listed rows', () => {
  it('hides hidden rows and shows vim rows only while the layer is on', () => {
    const off = listedShortcuts(false)
    expect(off.some((s) => s.hidden)).toBe(false)
    expect(off.some((s) => s.scope === 'vim')).toBe(false)
    expect(listedShortcuts(true).some((s) => s.id === 'vim.first')).toBe(true)
  })
})

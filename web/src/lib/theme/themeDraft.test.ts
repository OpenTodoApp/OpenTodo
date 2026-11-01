// @vitest-environment happy-dom
// The editor's draft and history (OpenSpec change theme-editor, task 4.4, design D6, D7).
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db'
import { resetDeviceId } from '../ops'
import nord from './builtin/nord.json'
import { saveCustomTheme } from './custom'
import { canRedo, canUndo, changedElsewhere, clearDraft, docText, isDirty, previousTokenValue, readDraft, record, redo, startHistory, undo, undoToken, withToken, writeDraft } from './draft'
import type { ThemeDocument } from './format'

const NORD = { ...(nord as unknown as ThemeDocument), id: 'th-1' }

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  localStorage.clear()
})

describe('drafts on the device', () => {
  it('a reload keeps the draft, no op is written before Save, and Save writes one op', async () => {
    await saveCustomTheme('th-1', NORD)
    await db.outbox.clear()
    let doc = NORD
    for (const [tok, v] of [['muted', '#9aa3b2'], ['faint', '#7a8292'], ['border', '#3b4252']] as const) {
      doc = withToken(doc, tok, v)
      writeDraft('th-1', { v: 1, doc, base: docText(NORD) })
    }
    // "Reload": the draft is read back from device storage.
    const back = readDraft('th-1')
    expect(back?.doc.tokens).toMatchObject({ muted: '#9aa3b2', faint: '#7a8292', border: '#3b4252' })
    expect(isDirty(back!.doc, NORD)).toBe(true)
    expect(await db.outbox.count()).toBe(0)
    await saveCustomTheme('th-1', back!.doc)
    clearDraft('th-1')
    expect((await db.outbox.toArray()).map((o) => o.field)).toEqual(['doc'])
    expect(readDraft('th-1')).toBeNull()
  })

  it('offers the saved version when the theme changed on another device', () => {
    const d = { v: 1 as const, doc: withToken(NORD, 'muted', '#9aa3b2'), base: docText(NORD) }
    expect(changedElsewhere(d, NORD)).toBe(false)
    expect(changedElsewhere(d, { ...NORD, name: 'Changed elsewhere' })).toBe(true)
    expect(changedElsewhere({ ...d, base: null }, NORD)).toBe(false)
  })

  it('ignores a malformed draft', () => {
    localStorage.setItem('ot.themeDraft.x', '{"v":1,"doc":"nope","base":null}')
    expect(readDraft('x')).toBeNull()
  })
})

describe('history', () => {
  it('undo and redo every change; a slider drag is one entry', () => {
    let h = startHistory(NORD)
    h = record(h, { ...NORD, seeds: { ...NORD.seeds, accent: '#000001' } }, 'seed:accent:H')
    h = record(h, { ...NORD, seeds: { ...NORD.seeds, accent: '#000002' } }, 'seed:accent:H')
    h = record(h, { ...NORD, name: 'X' })
    expect(h.past).toHaveLength(2)
    h = undo(h)
    expect(h.present.seeds.accent).toBe('#000002')
    h = undo(h)
    expect(h.present).toEqual(NORD)
    expect(canUndo(h)).toBe(false)
    h = redo(redo(h))
    expect(h.present.name).toBe('X')
    expect(canRedo(h)).toBe(false)
  })

  it('Reset makes a token derived again, and its Undo brings the set value back as a new entry', () => {
    let h = startHistory(withToken(NORD, 'faint', '#777777'))
    h = record(h, withToken(h.present, 'faint', undefined))
    expect(h.present.tokens?.faint).toBeUndefined()
    expect(previousTokenValue(h, 'faint')).toEqual({ value: '#777777' })
    h = undoToken(h, 'faint')
    expect(h.present.tokens?.faint).toBe('#777777')
    expect(h.past).toHaveLength(2)
    expect(previousTokenValue(startHistory(NORD), 'faint')).toBeNull()
  })
})

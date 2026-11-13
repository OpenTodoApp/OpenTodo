// Unlinked mentions (OpenSpec change unlinked-mentions, tasks 1.1, 1.2 and 2.2): the plain
// lines (code, link text and accents), the whole-word matcher, the rules of what never
// matches, Link through the document with one Undo, and a concurrent edit kept.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { db, useDatabase } from './db'
import { createNote } from './noteOps'
import { linkMention } from './noteMentionLink'
import { clearMentionCache, findMentions, matchTitle, mentionLines, wholeWordAt } from './noteMentions'
import { foldNote, resetDeviceId } from './ops'
import { activeBody, decodeDoc, encodeDoc, parseMarkdown, renderMarkdown, toModel, updateBody } from './richtext'
import { undoBatch } from './undo'
import type { Note } from './types'

let run = 0
beforeEach(() => {
  useDatabase(`mentions-${run++}`)
  resetDeviceId()
  clearMentionCache()
})

const note = (id: string, title: string, description: string, updated = 1): Note =>
  ({ id, title, description, project_id: null, labels: [], position: 1, created_at: updated, deleted_at: null } as unknown as Note)
const find = (notes: Note[], title = 'Trip to Lisbon', linking: string[] = []) =>
  findMentions({ kind: 'note', id: 'trip', title, tasks: [], projects: [], notes, linking: new Set(linking) })

describe('matching', () => {
  it('plain lines leave out code, link text and images; accents and case are folded', () => {
    expect(mentionLines('Ask **Ana** about `trip`\n\n```\ntrip to lisbon\n```\nSee [Trip to Lisbon](https://x) ![a](attachment:q)'))
      .toEqual(['Ask Ana about', 'See'])
    expect(matchTitle('Trip to Lisbón')).toBe('trip to lisbon')
    expect(wholeWordAt('the trip to lisbon ferry', 'trip to lisbon')).toBe(4)
    expect(wholeWordAt('roundtrip to lisbon', 'trip to lisbon')).toBe(-1)
    expect(wholeWordAt('東京旅行の計画', '旅行')).toBe(2)
  })

  it('A plain mention: listed with the title highlighted in its line', () => {
    const m = find([note('trip', 'Trip to Lisbon', 'mentions itself: trip to lisbon'), note('ideas', 'Lisbon ideas', 'Ask Ana about the trip to lisbon ferry')])
    expect(m.map((x) => x.id)).toEqual(['ideas'])
    expect(m[0].snippet.filter((s) => s.mark).map((s) => s.text)).toEqual(['trip to lisbon'])
  })

  it('Already linked, code and short titles: never listed', () => {
    const notes = [note('pack', 'Packing list', 'For the trip to Lisbon'), note('code', 'Snippets', '```\nTrip to Lisbon\n```'), note('go', 'Go', 'go go go')]
    expect(find(notes, 'Trip to Lisbon', ['note:pack']).map((x) => x.id)).toEqual([])
    expect(find(notes, 'Go')).toEqual([])
    expect(find(notes, '')).toEqual([])
  })
})

describe('Link', () => {
  it('Link one mention: the source reads as a link, Undo restores the plain text', async () => {
    const trip = await createNote({ title: 'Trip to Lisbon' })
    const ideas = await createNote({ title: 'Lisbon ideas', description: 'Ask Ana about the trip to lisbon ferry' })
    await foldNote('note', ideas)
    const undo = await linkMention({ kind: 'note', id: ideas }, { kind: 'note', id: trip, title: 'Trip to Lisbon' })
    expect(undo).not.toBeNull()
    expect((await db.notes.get(ideas))!.description).toBe(`Ask Ana about the [Trip to Lisbon](?note=${trip}) ferry`)
    await undoBatch(undo!)
    await foldNote('note', ideas)
    expect((await db.notes.get(ideas))!.description).toBe('Ask Ana about the trip to lisbon ferry')
    // Nothing left to link: null.
    const other = await createNote({ title: 'Other', description: 'nothing here' })
    expect(await linkMention({ kind: 'note', id: other }, { kind: 'note', id: trip, title: 'Trip to Lisbon' })).toBeNull()
  })

  it('Concurrent edit of the source: the link and a paragraph added elsewhere both survive', async () => {
    const trip = await createNote({ title: 'Trip to Lisbon' })
    const ideas = await createNote({ title: 'Lisbon ideas', description: 'Ask Ana about the trip to lisbon ferry' })
    await foldNote('note', ideas)
    const base = (await db.notes.get(ideas))!.notes_doc!
    const b = decodeDoc(base)!
    b.transact(() => updateBody(activeBody(b), [...toModel(activeBody(b)), ...parseMarkdown('Added offline on B')]))
    await linkMention({ kind: 'note', id: ideas }, { kind: 'note', id: trip, title: 'Trip to Lisbon' })
    const a = decodeDoc((await db.notes.get(ideas))!.notes_doc!)!
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b))
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
    const want = `Ask Ana about the [Trip to Lisbon](?note=${trip}) ferry\n\nAdded offline on B`
    expect(renderMarkdown(toModel(activeBody(a)))).toBe(want)
    expect(renderMarkdown(toModel(activeBody(b)))).toBe(want)
    expect(encodeDoc(a)).toBeTruthy()
  })
})

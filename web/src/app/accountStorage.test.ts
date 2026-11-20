// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { useDatabase } from '../lib/db'
import { POSITIONS_KEY } from '../lib/notesGraph'
import { resetDeviceId } from '../lib/ops'
import { setCurrentUserId } from '../lib/sharing'
import { NOTE_FILTERS_KEY, NOTE_TOKENS_KEY } from './notes/NotesPage'
import { ACCOUNT_KEYS, clearDeviceData, clearIfDifferentAccount } from './signOut'

// What the browser keeps outside the local database that belongs to the account
// (1.6.0 web security review, L1 and L2): a scheme trusted with "Don't ask again",
// the Notes chips with label and project names, and the rest of the account's
// names, text and entity ids. They go with a sign-out and with an account switch,
// so the next account on this browser starts without them (client-data-safety).
// Device preferences (theme, panel widths, shortcuts) stay.

const ACCOUNT_DATA: Record<string, string> = {
  appLinksTrusted: '["obsidian"]',
  'opentodo.notes.tokens': '[{"kind":"label","value":"Salary review"}]',
  'opentodo.notes.filters': '{"label":"Salary review"}',
  'opentodo.notes.graph.positions': '{"n1":[1,2]}',
  'opentodo.importJobs': '[{"id":"j1","file":"bank.csv"}]',
  'opentodo.taskPageSnapshots': '{"p1":"abc"}',
  'opentodo.notePageSnapshots': '{"p2":"def"}',
  'opentodo.collapsed': '["t1"]',
  'ot.groups.collapsed': '["inbox:p1"]',
  'ot.subprojects.collapsed': '["p1"]',
  'ot.objectives.collapsed': '["o1"]',
}

function store() {
  for (const [k, v] of Object.entries(ACCOUNT_DATA)) localStorage.setItem(k, v)
  sessionStorage.setItem('ot.draft.t1', 'a comment not sent yet')
  localStorage.setItem('ot.theme', 'dark')
}

function expectCleared() {
  for (const k of Object.keys(ACCOUNT_DATA)) expect(localStorage.getItem(k), k).toBeNull()
  expect(sessionStorage.getItem('ot.draft.t1')).toBeNull()
  // A device preference is no account data.
  expect(localStorage.getItem('ot.theme')).toBe('dark')
}

let n = 0
describe("the account's data in browser storage", () => {
  it('names the keys the modules use', () => {
    for (const k of [NOTE_TOKENS_KEY, NOTE_FILTERS_KEY, POSITIONS_KEY]) expect(ACCOUNT_KEYS).toContain(k)
    expect([...ACCOUNT_KEYS].sort()).toEqual(Object.keys(ACCOUNT_DATA).sort())
  })

  it('goes with a sign-out', async () => {
    useDatabase(`acct-storage-${Date.now()}-${n++}`)
    store()
    await clearDeviceData()
    expectCleared()
  })

  it('goes when a different account signs in', async () => {
    useDatabase(`acct-storage-${Date.now()}-${n++}`)
    resetDeviceId()
    await setCurrentUserId('A')
    store()
    expect(await clearIfDifferentAccount('B')).toBe(true)
    expectCleared()
  })
})

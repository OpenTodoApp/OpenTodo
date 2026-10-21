import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parse, rebaseDismissed, type ParseContext } from './parse'
import { chipAtCaret, dismissChip, findLabel, labelNameKey, toTaskInput } from './quickadd'
import {
  DEFAULT_QUICK_ADD_SETTINGS, formatMinutes, loadQuickAddSettings, resolveDayMonthOrder, resolveLanguages, saveQuickAddSettings,
} from './settings'

const ctx: ParseContext = { today: '2026-10-09', now: '10:00', languages: ['en'], projects: [{ id: 'w', name: 'Work' }] }

describe('toTaskInput', () => {
  const labels = [
    { id: 'l-call', name: 'Call', color: '#ef4444', position: 1 },
    { id: 'l-old', name: 'errand', deleted_at: 5 },
    { id: 'l-desk2', name: 'desk', position: 9 },
    { id: 'l-desk1', name: 'Desk', position: 2 },
  ]
  function deps(existing = labels) {
    const created: string[] = []
    return {
      created,
      deps: { labels: existing, createLabel: async (name: string) => { created.push(name); return `new-${name}` } },
    }
  }

  it('carries only explicit attributes so view defaults fill the rest', async () => {
    const d = deps()
    expect(await toTaskInput(parse('Buy milk', ctx), d.deps)).toEqual({ title: 'Buy milk' })
    expect(await toTaskInput(parse('Write report tomorrow #work @call p2 +45m', ctx), d.deps)).toEqual({
      title: 'Write report', due: { date: '2026-10-10' }, project_id: 'w', labels: ['l-call'], priority: 2, estimate_minutes: 45,
    })
    expect(d.created).toEqual([])
  })

  it('resolves @names to existing label ids ignoring case', async () => {
    const d = deps()
    expect((await toTaskInput(parse('Ring @CALL @call', ctx), d.deps)).labels).toEqual(['l-call'])
    // Duplicate names from sync: first in sidebar order wins, on every device.
    expect((await toTaskInput(parse('Tidy @DESK', ctx), d.deps)).labels).toEqual(['l-desk1'])
    expect(d.created).toEqual([])
  })

  it('creates a missing label once, ignoring deleted ones, and keeps typed order', async () => {
    const d = deps()
    const input = await toTaskInput(parse('Shop @errand @call @Errand', ctx), d.deps)
    expect(d.created).toEqual(['errand'])
    expect(input.labels).toEqual(['new-errand', 'l-call'])
  })

  it('stores only ids, never names', async () => {
    const d = deps([])
    const input = await toTaskInput(parse('Plan @Waiting-For', ctx), d.deps)
    expect(input.labels).toEqual(['new-Waiting-For'])
  })

  it('findLabel and labelNameKey follow the label store rules', () => {
    expect(labelNameKey('  Call ')).toBe('call')
    expect(findLabel('call', labels)?.id).toBe('l-call')
    expect(findLabel('errand', labels)).toBeUndefined()
    expect(findLabel('', labels)).toBeUndefined()
  })
})

describe('chipAtCaret (Backspace highlight)', () => {
  it('picks the last chip when it ends the line and the caret is at the end', () => {
    const v = 'Buy milk tomorrow p2'
    const r = parse(v, ctx)
    expect(chipAtCaret(r.chips, v, v.length, v.length)).toBe(1)
    const spaced = 'Buy milk tomorrow p2  '
    expect(chipAtCaret(parse(spaced, ctx).chips, spaced, spaced.length, spaced.length)).toBe(1)
  })

  it('does nothing when the caret is elsewhere, text is selected or the line ends in plain text', () => {
    const v = 'Buy milk tomorrow p2'
    const r = parse(v, ctx)
    expect(chipAtCaret(r.chips, v, 3, 3)).toBe(-1)
    expect(chipAtCaret(r.chips, v, 0, v.length)).toBe(-1)
    const plain = 'Buy milk tomorrow please'
    expect(chipAtCaret(parse(plain, ctx).chips, plain, plain.length, plain.length)).toBe(-1)
    expect(chipAtCaret([], 'x', 1, 1)).toBe(-1)
  })

  it('treats a due chip whose time ends the line as the last chip', () => {
    const v = 'Dentist tomorrow p1 at 3pm'
    const r = parse(v, ctx)
    const i = chipAtCaret(r.chips, v, v.length, v.length)
    expect(r.chips[i].kind).toBe('due')
  })
})

describe('dismissal bookkeeping', () => {
  it('Backspace twice: dismissing the highlighted chip keeps the text and drops the chip', () => {
    const v = 'Buy milk tomorrow p2'
    const r = parse(v, ctx)
    const dismissed = dismissChip([], r.chips[chipAtCaret(r.chips, v, v.length, v.length)])
    const after = parse(v, { ...ctx, dismissed })
    expect(after.priority).toBeNull()
    expect(after.title).toBe('Buy milk p2')
    expect(after.due).toEqual({ date: '2026-10-10' })
  })

  it('dismissing a multi-span due chip records every span once', () => {
    const r = parse('Call tomorrow #work at 9', ctx)
    const due = r.chips.find((c) => c.kind === 'due')!
    const once = dismissChip([], due)
    expect(once).toHaveLength(2)
    expect(dismissChip(once, due)).toHaveLength(2)
    expect(parse('Call tomorrow #work at 9', { ...ctx, dismissed: once })).toMatchObject({ title: 'Call tomorrow at 9', due: null, projectId: 'w' })
  })

  it('typing after a dismissed word keeps it dismissed (Review may report … with Ana)', () => {
    let line = 'Review may report'
    let dismissed = dismissChip([], parse(line, ctx).chips[0])
    for (const next of ['Review may report ', 'Review may report w', 'Review may report with Ana']) {
      dismissed = rebaseDismissed(line, next, dismissed)
      line = next
      expect(parse(line, { ...ctx, dismissed }).chips.some((c) => c.kind === 'due')).toBe(false)
    }
    expect(parse(line, { ...ctx, dismissed }).title).toBe('Review may report with Ana')
  })
})

/** In-memory Storage stand-in; the test environment is Node without localStorage. */
function memoryStorage() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  }
}

describe('quick-add settings', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('defaults to parsing on, browser languages, automatic date order', () => {
    expect(loadQuickAddSettings()).toEqual(DEFAULT_QUICK_ADD_SETTINGS)
  })

  it('round-trips through localStorage and sanitises bad data', () => {
    saveQuickAddSettings({ enabled: false, languages: ['de', 'fr'], dayMonthOrder: 'MD' })
    expect(loadQuickAddSettings()).toEqual({ enabled: false, languages: ['de', 'fr'], dayMonthOrder: 'MD' })
    localStorage.setItem('opentodo.quickadd', JSON.stringify({ enabled: 'yes', languages: ['xx', 'it'], dayMonthOrder: 'YMD' }))
    expect(loadQuickAddSettings()).toEqual({ enabled: true, languages: ['it'], dayMonthOrder: 'auto' })
    localStorage.setItem('opentodo.quickadd', '{not json')
    expect(loadQuickAddSettings()).toEqual(DEFAULT_QUICK_ADD_SETTINGS)
  })

  it('survives storage that throws', () => {
    const blocked = () => {
      throw new Error('blocked')
    }
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked })
    expect(() => saveQuickAddSettings(DEFAULT_QUICK_ADD_SETTINGS)).not.toThrow()
    expect(loadQuickAddSettings()).toEqual(DEFAULT_QUICK_ADD_SETTINGS)
  })

  it('resolves languages from the override or the browser', () => {
    expect(resolveLanguages(DEFAULT_QUICK_ADD_SETTINGS, ['de-AT', 'en'])).toEqual(['de', 'en'])
    expect(resolveLanguages({ ...DEFAULT_QUICK_ADD_SETTINGS, languages: ['pt'] }, ['de'])).toEqual(['pt', 'en'])
    expect(resolveLanguages(DEFAULT_QUICK_ADD_SETTINGS, ['ko'])).toEqual(['en'])
    // An explicit empty list means English only, not "follow the browser".
    expect(resolveLanguages({ ...DEFAULT_QUICK_ADD_SETTINGS, languages: [] }, ['de'])).toEqual(['en'])
  })

  it('resolves the numeric date order', () => {
    const auto = DEFAULT_QUICK_ADD_SETTINGS
    expect(resolveDayMonthOrder(auto, ['en-US'])).toBe('MD')
    expect(resolveDayMonthOrder(auto, ['en'])).toBe('MD')
    expect(resolveDayMonthOrder(auto, ['en-GB'])).toBe('DM')
    expect(resolveDayMonthOrder(auto, ['de-DE', 'en-US'])).toBe('DM')
    expect(resolveDayMonthOrder(auto, ['ja', 'fr'])).toBe('DM')
    expect(resolveDayMonthOrder(auto, ['ja'])).toBe('MD')
    expect(resolveDayMonthOrder({ ...auto, languages: ['it'] }, ['en-US'])).toBe('DM')
    expect(resolveDayMonthOrder({ ...auto, dayMonthOrder: 'MD' }, ['de'])).toBe('MD')
  })

  it('formats estimates', () => {
    expect([formatMinutes(45), formatMinutes(60), formatMinutes(90), formatMinutes(125)]).toEqual(['45m', '1h', '1h30m', '2h5m'])
  })
})

describe('deadline in the task input (OpenSpec deadlines 7.1)', () => {
  it('passes the deadline through only when the line set one', async () => {
    const deps = { labels: [], createLabel: async () => 'x' }
    const base = { title: 'Report', due: null, start: null, evening: false, projectId: null, labels: [], priority: null, estimateMinutes: null, spentMinutes: null, recurrence: null, reminders: [], chips: [], unmatched: [] }
    expect(await toTaskInput({ ...base, deadline: '2026-10-16' }, deps)).toEqual({ title: 'Report', deadline: '2026-10-16' })
    expect(await toTaskInput({ ...base, deadline: null }, deps)).toEqual({ title: 'Report' })
  })
})

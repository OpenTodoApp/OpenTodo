// @vitest-environment happy-dom
// Feature switches per workspace (OpenSpec change workspace-feature-switches, tasks
// 2.1, 2.2, 2.4): the rule, the cached read, and a walk of the sidebar's More
// destinations and the palette's commands with each feature off, so nothing of a
// feature that is off stays visible.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { COMMAND_FEATURES, FEATURES, featureOn, type FeatureId } from '../lib/features'
import { resetDeviceId } from '../lib/ops'
import type { ListState } from './listActions'
import type { Task, User, WorkspaceEntry } from '../lib/types'
import { readWorkspaceState, storeWorkspaces, switchTo } from '../lib/workspaces'
import { click, render, waitFor } from '../ui/test-utils'
import { commands, type PaletteContext } from './palette/registry'
import { FeatureOff } from './FeatureOff'
import { ROUTE_FEATURES, ROUTE_SCREENS } from './screens'
import { moreEntriesOf } from './Sidebar'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as unknown as User
const entry = (id: string, extra: Partial<WorkspaceEntry> = {}): WorkspaceEntry =>
  ({ id, name: id, icon: '', color: '', default: false, role: 'owner', ownerId: 'u1', members: [], groups: [], ...extra })

/** Every feature on except `off`. */
const allBut = (off: FeatureId | null) => (id: FeatureId | null | undefined) => !id || id !== off

const task = { id: 't1', title: 'Post the parcel', priority: 4, labels: [], completed_at: null, deleted_at: null } as unknown as Task
const list = {
  rows: () => [task], columns: () => null, selected: () => 't1', select: () => {}, openId: () => null, open: () => {},
  readOnly: () => false, manual: () => false, focusQuickAdd: () => false, toggleComplete: async () => {},
} as unknown as ListState

/** A palette context that offers as much as it can: a task selected, a note open, habits and daily notes on, a missed block. */
const ctx = (features: PaletteContext['features']): PaletteContext => ({
  route: { view: 'today' }, user, today: '2026-11-24', list, task, filterQuery: null, query: 'describe', vimEnabled: false,
  showShortcuts: () => {}, focusQuickAdd: () => false, note: { id: 'n1', pinned: false },
  habits: true, dailyNotes: true, missedBlocks: 1, features,
})

/** The feature a command belongs to: its own entry, or the route of a Go to command. */
function featureOfCommand(id: string): FeatureId | null {
  if (COMMAND_FEATURES[id]) return COMMAND_FEATURES[id]
  const view = /^go:([a-z-]+)/.exec(id)?.[1]
  return view && view in ROUTE_FEATURES ? ROUTE_FEATURES[view as keyof typeof ROUTE_FEATURES] : null
}

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
})

describe('featureOn', () => {
  it('reads a missing map and a missing key as on, only false as off', () => {
    expect(featureOn(undefined, 'habits')).toBe(true)
    expect(featureOn({}, 'habits')).toBe(true)
    expect(featureOn({ features: {} }, 'habits')).toBe(true)
    expect(featureOn({ features: { habits: false } }, 'habits')).toBe(false)
    expect(featureOn({ features: { habits: false } }, 'focus')).toBe(true)
  })

  it('works offline from the cached directory', async () => {
    await storeWorkspaces([entry('w-p', { default: true }), entry('w-fam', { features: { routines: false } })])
    await switchTo('w-fam')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const s = await readWorkspaceState()
    const current = s.list.find((w) => w.id === s.current)
    expect(featureOn(current, 'routines')).toBe(false)
    expect(featureOn(s.list.find((w) => w.default), 'routines')).toBe(true)
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('names a feature for every gated route, and every route is in the map', () => {
    expect(Object.keys(ROUTE_FEATURES).sort()).toEqual(Object.keys(ROUTE_SCREENS).sort())
    const gated = new Set(Object.values(ROUTE_FEATURES).filter(Boolean))
    // Time tracking has no page of its own; every other feature has one.
    expect([...gated].sort()).toEqual(FEATURES.filter((f) => f !== 'time-tracking').sort())
  })
})

describe('nothing of a feature that is off stays visible', () => {
  const more = (on: ReturnType<typeof allBut>) => moreEntriesOf({ shared: true, reviewDot: null, reviewText: '', unreadBadge: null, unreadTotal: 0, ask: true, habits: true, on })
  const seenOn = new Set(more(allBut(null)).map((m) => ROUTE_FEATURES[m.route.view]))
  const commandsOn = commands(ctx(allBut(null)))

  for (const f of FEATURES) {
    it(`${f} off: no More destination and no command of it`, () => {
      expect(more(allBut(f)).filter((m) => ROUTE_FEATURES[m.route.view] === f).map((m) => m.id)).toEqual([])
      expect(commands(ctx(allBut(f))).filter((c) => featureOfCommand(c.id) === f).map((c) => c.id)).toEqual([])
      // Each list loses only what belongs to the feature.
      expect(more(allBut(f)).length).toBe(more(allBut(null)).filter((m) => ROUTE_FEATURES[m.route.view] !== f).length)
    })
  }

  it('offers the gated destinations and commands while everything is on', () => {
    for (const f of ['habits', 'focus', 'routines', 'weekly-review', 'locations'] as const) expect(seenOn.has(f)).toBe(true)
    const ids = commandsOn.map((c) => c.id)
    for (const id of ['go:notes', 'go:daily-note', 'go:day', 'new:frame', 'go:habits', 'task:focus', 'go:rules', 'routine:run', 'go:review', 'go:stats', 'go:places', 'task:location', 'replan:day', 'note:run-routine']) {
      expect(ids).toContain(id)
    }
  })
})

describe('FeatureOff', () => {
  let calls: [string, string, unknown][] = []
  beforeEach(() => {
    calls = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([init?.method ?? 'GET', String(url), init?.body ? JSON.parse(String(init.body)) : undefined])
      return new Response(JSON.stringify({ workspaces: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }))
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('says the feature is off, with Turn on for a manager that writes one key', async () => {
    await storeWorkspaces([entry('w-p', { default: true }), entry('w-fam', { features: { habits: false } })])
    await switchTo('w-fam')
    const r = await render(<FeatureOff id="habits" />)
    await waitFor(() => r.container.textContent!.includes('Habits is off in this workspace.'))
    await waitFor(() => !!r.container.querySelector('button'))
    await click(r.container.querySelector('button')!)
    await waitFor(() => calls.some(([m]) => m === 'PATCH'))
    expect(calls.find(([m]) => m === 'PATCH')).toEqual(['PATCH', '/api/v1/workspaces/w-fam', { features: { habits: true } }])
    // The change wakes a sync; wait for it while fetch is still mocked.
    await waitFor(() => calls.some(([, url]) => url.endsWith('/api/v1/sync')), 'the sync after the change')
    await r.unmount()
  })

  it('offers nothing to a member', async () => {
    await storeWorkspaces([entry('w-p', { default: true }), entry('w-fam', { role: 'member', features: { habits: false } })])
    await switchTo('w-fam')
    const r = await render(<FeatureOff id="habits" />)
    await waitFor(() => r.container.textContent!.includes('Habits is off in this workspace.'))
    expect(r.container.querySelector('button')).toBeNull()
    await r.unmount()
  })
})

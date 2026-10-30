// Bento in the Daily check (OpenSpec change bento-daily-check, task 2.1): the sizes,
// the reconciling read of design D3, the order of D6 and the one batch of D5.
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { OP_DEFAULTS } from '../generated/opSchema'
import { applyOps, resetDeviceId } from './ops'
import { undoBatch } from './undo'
import { bentoSize, orderedFocusIds, parseFocusSlots, readBento, readBentoOrder, readFocusStyle, setBentoOrder, setFocusStyle, slotOrder } from './bento'
import { bentoPatch, bentoPress, freeSlots, withPlaced, withRemoved, writeBento } from './bentoSlots'
import type { Review, Task } from './types'

const TODAY = '2026-10-30'
const task = (id: string, estimate: number | null = null, extra: Partial<Task> = {}): Task =>
  ({ ...OP_DEFAULTS.task, id, title: `Task ${id}`, estimate_minutes: estimate, created_at: 1, _clock: {}, ...extra }) as Task
const review = (focus: string, focus_slots = '', focus_date = TODAY) => ({ focus, focus_slots, focus_date }) as Pick<Review, 'focus' | 'focus_date' | 'focus_slots'>
const ids = (xs: (Task | null)[]) => xs.map((x) => x?.id ?? null)

let n = 0
beforeEach(() => {
  useDatabase(`bento-${Date.now()}-${n++}`)
  resetDeviceId()
})

describe('sizes (design D2)', () => {
  it('Small up to 30, Medium 31 to 89, Large 90 or more, none without an estimate', () => {
    expect([1, 15, 30].map(bentoSize)).toEqual(['S', 'S', 'S'])
    expect([31, 45, 60, 89].map(bentoSize)).toEqual(['M', 'M', 'M', 'M'])
    expect([90, 120, 600].map(bentoSize)).toEqual(['L', 'L', 'L'])
    expect([null, undefined, 0, -5, Number.NaN].map(bentoSize)).toEqual([null, null, null, null, null])
  })
})

describe('preferences (design D4)', () => {
  it('empty and unknown values read as Three tasks and Frog', () => {
    expect([readFocusStyle(null), readFocusStyle({ focus_style: '' }), readFocusStyle({ focus_style: 'later' }), readFocusStyle({ focus_style: 'bento' })]).toEqual(['three', 'three', 'three', 'bento'])
    expect([readBentoOrder(undefined), readBentoOrder({ bento_order: 'x' }), readBentoOrder({ bento_order: 'summit' })]).toEqual(['frog', 'frog', 'summit'])
    expect(slotOrder('frog')).toEqual(['L', 'M', 'S'])
    expect(slotOrder('summit')).toEqual(['M', 'L', 'S'])
  })

  it('each choice is one synced op on user_prefs and writes nothing to the focus', async () => {
    await setFocusStyle('bento')
    await setBentoOrder('summit')
    const queued = (await db.outbox.toArray()).map(({ entity, field, value }) => ({ entity, field, value }))
    expect(queued).toEqual([{ entity: 'user_prefs', field: 'focus_style', value: 'bento' }, { entity: 'user_prefs', field: 'bento_order', value: 'summit' }])
  })
})

describe('reading (design D3)', () => {
  const tasks = [task('big', 120), task('mid', 45), task('small', 20), task('none'), task('big2', 180)]

  it('parses entries and ignores malformed ones', () => {
    expect(parseFocusSlots('L:a, M:b,X:c,S:,bad,S:d')).toEqual([{ slot: 'L', id: 'a' }, { slot: 'M', id: 'b' }, { slot: 'S', id: 'd' }])
  })

  it('stored entries win over estimates: a slot is a choice', () => {
    const r = readBento(review('mid,big', 'S:big,L:mid'), TODAY, tasks)
    expect(ids([r.slots.L, r.slots.M, r.slots.S])).toEqual(['mid', null, 'big'])
  })

  it('an older client’s focus without slots: by estimate, then the first free slot in Frog order', () => {
    const r = readBento(review('none,small,big'), TODAY, tasks)
    expect(ids([r.slots.L, r.slots.M, r.slots.S])).toEqual(['big', 'none', 'small'])
    expect(r.unsized).toEqual([])
  })

  it('an entry counts only for an id still in focus (an older device replaced the focus)', () => {
    const r = readBento(review('big2,mid,none', 'L:big,M:mid,S:small'), TODAY, tasks)
    expect(ids([r.slots.L, r.slots.M, r.slots.S])).toEqual(['big2', 'mid', 'none'])
  })

  it('two tasks for one slot: the second takes the first free slot', () => {
    const r = readBento(review('big,big2'), TODAY, tasks)
    expect(ids([r.slots.L, r.slots.M, r.slots.S])).toEqual(['big', 'big2', null])
  })

  it('more than three: the rest are Not sized, after the slots', () => {
    const r = readBento(review('big,mid,small,none'), TODAY, tasks)
    expect(r.unsized.map((x) => x.id)).toEqual(['none'])
    expect(orderedFocusIds(review('big,mid,small,none'), { focus_style: 'bento' }, TODAY, tasks)).toEqual(['big', 'mid', 'small', 'none'])
  })

  it('a stale focus_date reads as an empty Bento; missing tasks drop out', () => {
    expect(ids(Object.values(readBento(review('big', 'L:big', '2026-10-29'), TODAY, tasks).slots))).toEqual([null, null, null])
    const r = readBento(review('gone,mid', 'L:gone'), TODAY, tasks)
    expect(ids([r.slots.L, r.slots.M, r.slots.S])).toEqual([null, 'mid', null])
  })

  it('the order: Frog L, M, S; Summit M, L, S; Three tasks keeps the picked order', () => {
    const r = review('small,big,mid')
    expect(orderedFocusIds(r, { focus_style: 'bento' }, TODAY, tasks)).toEqual(['big', 'mid', 'small'])
    expect(orderedFocusIds(r, { focus_style: 'bento', bento_order: 'summit' }, TODAY, tasks)).toEqual(['mid', 'big', 'small'])
    expect(orderedFocusIds(r, { focus_style: '' }, TODAY, tasks)).toEqual(['small', 'big', 'mid'])
  })
})

describe('pressing f (design D5)', () => {
  const tasks = [task('big', 120), task('mid', 45), task('small', 20), task('none'), task('big2', 180)]

  it('places by estimate, refuses a taken slot naming its task, asks for an unestimated one, removes a focused one', () => {
    const r = readBento(review('big'), TODAY, tasks)
    expect(bentoPress(r, tasks[1])).toEqual({ kind: 'place', slot: 'M' })
    expect(bentoPress(r, tasks[4])).toEqual({ kind: 'taken', slot: 'L', occupant: tasks[0] })
    expect(bentoPress(r, tasks[3])).toEqual({ kind: 'choose' })
    expect(bentoPress(r, tasks[0])).toEqual({ kind: 'remove' })
    expect(freeSlots(r)).toEqual(['M', 'S'])
    const full = readBento(review('big,mid,small'), TODAY, tasks)
    expect(bentoPress(full, tasks[3])).toEqual({ kind: 'full' })
  })

  it('the patch: focus in listing order, the entries, the date', () => {
    const r = withPlaced(readBento(review('small,mid'), TODAY, tasks), tasks[0], 'L')!
    expect(bentoPatch(r, 'frog', TODAY)).toEqual({ focus_date: TODAY, focus: 'big,mid,small', focus_slots: 'L:big,M:mid,S:small' })
    expect(bentoPatch(r, 'summit', TODAY).focus).toBe('mid,big,small')
    expect(withPlaced(r, tasks[4], 'L')).toBeNull()
    const moved = withPlaced(r, tasks[2], 'M')
    expect(moved).toBeNull()
    expect(bentoPatch(withRemoved(r, 'mid'), 'frog', TODAY)).toEqual({ focus_date: TODAY, focus: 'big,small', focus_slots: 'L:big,S:small' })
  })

  it('one batch on the review row, undone in one step', async () => {
    await applyOps([{ id: 'f', entity: 'review', entityId: 'me', field: 'focus', value: 'mid', ts: 10, device: 'laptop' },
      { id: 'd', entity: 'review', entityId: 'me', field: 'focus_date', value: TODAY, ts: 10, device: 'laptop' }])
    const before = await db.review.get('me')
    const next = withPlaced(readBento(before, TODAY, tasks), tasks[3], 'S')!
    const entry = await writeBento(before, next, 'frog', TODAY, 'placed')
    const row = await db.review.get('me')
    expect([row?.focus, row?.focus_slots, row?.focus_date]).toEqual(['mid,none', 'M:mid,S:none', TODAY])
    const fields = (await db.outbox.toArray()).map((o) => `${o.entity}.${o.field}`).sort()
    expect(fields).toEqual(['review.focus', 'review.focus_date', 'review.focus_slots'])
    expect(await db.tasks.count()).toBe(0)
    await undoBatch(entry!.id)
    const undone = await db.review.get('me')
    expect([undone?.focus, undone?.focus_slots]).toEqual(['mid', ''])
  })
})

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { mutate, resetDeviceId } from './ops'
import { applyChanges, reviewChangeSet, withHabitsOn } from './assistant'
import { skillsForHabits, type AssistantSkill } from './assistantSkills'
import type { ProposedChange } from './assistantTypes'

// OpenSpec change habits-assistant, assistant-skills "Habit skills".

let n = 0
beforeEach(() => {
  useDatabase(`assistant-habits-${Date.now()}-${n++}`)
  resetDeviceId()
})

const skill = (id: string): AssistantSkill => ({ id, name: id, description: '', example: '', result: 'answer' })
const list = ['capture', 'start-habit', 'habit-check', 'brief-today'].map(skill)

describe('the skill list follows the Habits preference', () => {
  it('off leaves out both habit skills; on and not decided keep them', () => {
    expect(skillsForHabits(list, 'off').map((s) => s.id)).toEqual(['capture', 'brief-today'])
    expect(skillsForHabits(list, 'on')).toEqual(list)
    expect(skillsForHabits(list, 'undecided')).toEqual(list)
    expect(skillsForHabits(list, undefined)).toEqual(list)
  })
})

describe('applying a habit proposal', () => {
  const habit: ProposedChange = { entity: 'task', entityId: 't-read', create: true, patch: { title: 'Read', recurrence: 'every day', habit: true, due: { date: '2026-11-14' } } }

  it('turns Habits on while it is not decided, in the same batch', async () => {
    expect((await withHabitsOn([habit])).at(-1)).toEqual({ entity: 'user_prefs', entityId: 'me', patch: { habits: 'on' } })
    await applyChanges([habit])
    expect((await db.userPrefs.get('me'))?.habits).toBe('on')
    expect((await db.tasks.get('t-read'))?.habit).toBe(true)
  })

  it('leaves a decided preference and a proposal without a habit alone', async () => {
    await mutate('user_prefs', 'me', { habits: 'off' })
    expect(await withHabitsOn([habit])).toEqual([habit])
    const plain: ProposedChange = { entity: 'task', entityId: 't-x', create: true, patch: { title: 'Buy milk' } }
    expect(await withHabitsOn([plain])).toEqual([plain])
  })
})

describe('a check-in in a proposal (capture with log_habit)', () => {
  it('reads as the habit, its state, the day and the note, not as a new task', async () => {
    const record: ProposedChange = { entity: 'task', entityId: 'occ-1', create: true, patch: { title: 'Run', series_id: 'run', occurrence_date: '2026-11-14', completed_at: 1, skipped: false, tiny: false, description: '5k, knee sore' } }
    const skip: ProposedChange = { entity: 'task', entityId: 'occ-2', create: true, patch: { title: 'Stretch', series_id: 'stretch', occurrence_date: '2026-11-14', completed_at: 1, skipped: true } }
    const review = await reviewChangeSet([record, skip])
    expect(review.items.map((i) => i.title)).toEqual(['Check in Run', 'Check in Stretch'])
    expect(review.items[0].lines[0]).toBe('Done')
    expect(review.items[0].lines.at(-1)).toBe('5k, knee sore')
    expect(review.items[1].lines[0]).toBe('Skipped')
  })
})

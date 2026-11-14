// The Habits steps on a device (OpenSpec change habits-assistant, design D6):
// the server's internal/rules/routine_habits.go over the run's rows, with the
// numbers of lib/habits.ts and the writes of lib/habitLog.ts.
import { continuedIds, habitStatsMap, isGraduated } from '../../habits'
import { planLog } from '../../habitLog'
import type { RoutineStep, Task } from '../../types'
import { fail, none, tasksVal, type ExecResult, type Inputs, type RunState } from './state'
import { dateStep } from './more'

export function findHabits(st: RunState, s: RoutineStep): ExecResult {
  const tasks = [...st.tasks.values()] as unknown as Task[]
  const stats = habitStatsMap(tasks, st.w.today)
  const continued = continuedIds(tasks)
  const only = st.litStr(s, 'only')
  const streak = st.litNum(s, 'streak') ?? 0
  const ids: string[] = []
  const habits = tasks.filter((t) => stats.has(t.id) && !isGraduated(t) && !continued.has(t.id)).sort((a, b) => (a.title < b.title ? -1 : a.title > b.title ? 1 : 0))
  for (const t of habits) {
    const h = stats.get(t.id)!
    if ((only === 'at_risk' && !h.atRisk) || (only === 'back_on_track' && !h.backOnTrack) || (streak > 0 && h.current < streak)) continue
    ids.push(t.id)
  }
  return [tasksVal(ids), '']
}

export function logHabit(st: RunState, s: RoutineStep, inputs: Inputs): ExecResult {
  const habit = st.entityIn(s, inputs, 'habit')
  const series = habit ? (st.tasks.get(habit.id ?? '') as unknown as Task | undefined) : undefined
  if (!series || series.deleted_at) throw fail('not_found', `task ${habit?.id ?? ''} not found`)
  const [day] = dateStep(st, { ...s, in: { date: s.in?.date ?? { literal: 'today' } } } as RoutineStep, new Map(inputs.has('date') ? [['date', inputs.get('date')!]] : []))
  const state = (st.litStr(s, 'state') ?? 'done') as 'done' | 'tiny' | 'skipped'
  const planned = planLog(series, [...st.tasks.values()] as unknown as Task[], day.date ?? st.w.today, state, st.textIn(s, inputs, 'note') ?? '', st.w.now, st.w.today)
  if (typeof planned === 'string') throw fail(planned, planned === 'not_a_habit' ? 'the task is not an open habit' : 'not a scheduled day of the habit from its first one to today')
  if (!planned.length) return [none(), 'skipped']
  st.lay(...(planned as never[]))
  return [none(), '']
}

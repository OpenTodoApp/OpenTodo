// The re-plan preview's state in Day and Week (OpenSpec change replan-the-day, design
// D4): open from the header, the menus or a request (Today's menu, the palette), the
// proposal recomputed whenever the data or the clock that feed it change, closed with
// "Nothing to re-plan" when nothing is behind any more, and applied as one batch.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { covers, type EventsWindow } from '../../lib/calendarFeeds'
import type { GridPrefs } from '../../lib/calendar'
import { useMembershipMap } from '../../lib/liveData'
import { t } from '../../lib/i18n'
import { missedBlocks, replan, type ReplanProposal, type UnfitChoice } from '../../lib/replan'
import { useMe, useRunningEntry } from '../../lib/timeEntries'
import { replanUndoable } from '../../lib/undoActions'
import type { CalendarEvent, Project, Task } from '../../lib/types'
import { hueFor } from '../../ui'
import { act } from '../actionError'
import { showUndoToast } from '../bulk/toastStore'
import { replanRequest } from '../signals'
import type { ReplanGhosts } from './DayColumn'

export interface ReplanPreviewState {
  /** Today's missed blocks while today is on screen (0 otherwise). */
  missed: number
  /** The live proposal while the preview is open. */
  proposal: ReplanProposal | null
  choice: UnfitChoice
  setChoice: (c: UnfitChoice) => void
  calendarsUnavailable: boolean
  start: () => void
  apply: () => void
  cancel: () => void
  /** Ghosts and faint originals of a day on the wide grid. */
  ghostsFor: (date: string) => ReplanGhosts | null
}

export function useReplanPreview(c: {
  today: string
  dates: readonly string[]
  nowMinutes: number
  /** Tasks in the viewer's zone, and the stored rows by id. */
  tasks: readonly Task[]
  rawMap: ReadonlyMap<string, Task>
  projects: readonly Project[]
  projectMap: ReadonlyMap<string, Project>
  prefs: GridPrefs
  events: readonly CalendarEvent[]
  /** Today's calendar slots, fixed obstacles of the proposal (calendar-slots D8). */
  obstacles?: readonly { start: number; end: number }[]
  /** Subscriptions exist and the Calendars toggle shows them. */
  eventsUsed: boolean
  win: EventsWindow | null
  online: boolean
  zone?: string
  /** The live tasks have been read (before that nothing is known to be behind). */
  loaded: boolean
  goTo: (date: string) => void
}): ReplanPreviewState {
  const memberships = useMembershipMap()
  const me = useMe()
  const runningTaskId = useRunningEntry()?.task_id ?? null
  const showsToday = c.dates.includes(c.today)
  const [open, setOpen] = useState(false)
  const [choice, setChoice] = useState<UnfitChoice>('leave')
  const base = useMemo(() => ({ today: c.today, now: c.nowMinutes, tasks: c.tasks, projects: c.projects, memberships, me, runningTaskId }),
    [c.today, c.nowMinutes, c.tasks, c.projects, memberships, me, runningTaskId])
  const missed = useMemo(() => (showsToday ? missedBlocks(base).length : 0), [showsToday, base])
  const proposal = useMemo(() => (open && showsToday ? replan({ ...base, endHour: c.prefs.endHour, events: c.events, obstacles: c.obstacles, zone: c.zone }) : null),
    [open, showsToday, base, c.prefs.endHour, c.events, c.obstacles, c.zone])

  const start = useCallback(() => { setChoice('leave'); setOpen(true) }, [])
  const cancel = useCallback(() => setOpen(false), [])

  // A request from Today's menu or the palette: take it on mount and while mounted; show today first.
  const { goTo, today } = c
  useEffect(() => {
    const take = () => {
      if (!replanRequest.take()) return
      if (!showsToday) goTo(today)
      start()
    }
    take()
    return replanRequest.subscribe(take)
  }, [showsToday, goTo, today, start])

  // Recomputed live; once nothing is behind, the preview closes and says so.
  useEffect(() => {
    if (open && c.loaded && missed === 0 && showsToday) {
      setOpen(false)
      showUndoToast(t('Nothing to re-plan'), null)
    }
  }, [open, c.loaded, missed, showsToday])

  const apply = useCallback(() => {
    if (!proposal) return
    setOpen(false)
    const ids = [...proposal.moves, ...proposal.unfit].map((m) => m.id)
    const stored = new Map(ids.map((id) => [id, c.rawMap.get(id)?.due ?? null]))
    act(replanUndoable(proposal, { today: c.today, choice, stored, zone: c.zone }).then((r) => showUndoToast(r.label, r.entry?.id ?? null)))
  }, [proposal, choice, c.rawMap, c.today, c.zone])

  const taskById = useMemo(() => new Map(c.tasks.map((tk) => [tk.id, tk])), [c.tasks])
  const ghosts = useMemo<ReplanGhosts | null>(() => proposal && {
    movesTo: new Map(proposal.moves.map((m) => [m.id, m.to])),
    ghosts: proposal.moves.map((m) => {
      const tk = taskById.get(m.id)
      return { id: `replan-ghost:${m.id}`, start: m.to, length: m.length, title: tk?.title ?? '', hue: hueFor(tk?.project_id ? c.projectMap.get(tk.project_id)?.color : null) }
    }),
  }, [proposal, taskById, c.projectMap])
  const ghostsFor = useCallback((date: string) => (date === c.today ? ghosts : null), [ghosts, c.today])

  const calendarsUnavailable = c.eventsUsed && !c.online && !covers(c.win, { from: c.today, to: c.today })
  return { missed, proposal, choice, setChoice, calendarsUnavailable, start, apply, cancel, ghostsFor }
}

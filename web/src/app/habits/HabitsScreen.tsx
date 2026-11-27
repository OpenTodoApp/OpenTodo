// The Habits screen (OpenSpec change habits-home, design D9): every open habit by
// part of the day (Morning, Afternoon, This Evening, then Any time), ordered by time
// and title, then a folded Graduated group; /habits/<id> is a habit's page (habits-polish D3). One title row of chrome; rendered from
// the device's rows only, offline too. While Habits is not on, the address says so.
import { useState } from 'react'
import { habitStats, keptDays } from '../../lib/habits'
import { resume } from '../../lib/habitActions'
import { useHabitsEnabled } from '../../lib/habitPrefs'
import { t } from '../../lib/i18n'
import { Button, EmptyState, ListGroupHeader, PageBody, PageHeader, type HueName } from '../../ui'
import type { Task } from '../../lib/types'
import { act } from '../actionError'
import { showUndoToast } from '../bulk/toastStore'
import { navigate } from '../router'
import { useToday } from '../useViews'
import { openHabitForm } from './habitFormStore'
import { HabitPage } from './HabitPage'
import { HabitRow } from './HabitRow'
import { DayNoteHost } from './DayNoteDialog'
import { AmountHost } from './AmountDialog'
import { GROUP_TITLE, progressText, useHabitsModel } from './useHabitsModel'

export const STARTERS = [() => t('Drink water'), () => t('Read 10 minutes'), () => t('Walk after lunch')]

export function HabitsOff() {
  return (
    <PageBody width="form" data-habits-off>
      <PageHeader title={t('Habits')} />
      <EmptyState icon="leaf" title={t('Habits is off')}
        control={<Button size="sm" variant="secondary" onClick={() => navigate({ view: 'settings', section: 'account', page: 'profile', anchor: 'how-you-work' })}>{t('How you work')}</Button>} />
    </PageBody>
  )
}

export default function HabitsScreen({ id }: { id?: string } = {}) {
  const on = useHabitsEnabled()
  const today = useToday()
  const model = useHabitsModel(today, today)
  const opts = model.opts
  if (!on) return model.loaded ? <HabitsOff /> : null
  if (id) return <HabitPage key={id} id={id} />
  const hue = model.hue
  return (
    <PageBody width="form" data-habits-page>
      <PageHeader title={t('Habits')} help="habits" meta={progressText(model.progress, true)}
        actions={<Button variant="primary" size="sm" icon="plus" onClick={() => openHabitForm()} data-new-habit>{t('New habit')}</Button>} />
      {model.count === 0 && model.graduated.length === 0 && (
        <EmptyState title={t('Start with something small')}
          control={(
            <div className="flex flex-wrap justify-center gap-2" data-habit-starters>
              {STARTERS.map((s) => <Button key={s()} size="sm" variant="secondary" onClick={() => openHabitForm({ title: s() })}>{s()}</Button>)}
            </div>
          )} />
      )}
      {model.groups.map(({ g, items }) => (
        <section key={g} aria-label={GROUP_TITLE[g]()} data-habit-group={g}>
          <ListGroupHeader title={GROUP_TITLE[g]()} />
          <ul className="space-y-0.5">
            {items.map((x) => {
              const rows = model.rowsOf(x)
              return <HabitRow key={x.id} series={x} rows={rows} stats={habitStats(x, rows, today, opts)} hue={hue(x)} today={today} opts={opts} />
            })}
          </ul>
        </section>
      ))}
      <GraduatedGroup habits={model.graduated} rowsOf={model.rowsOf} hue={hue} />
      <DayNoteHost />
      <AmountHost />
    </PageBody>
  )
}

/** Graduated habits, folded, with how long each was kept and Resume (habits-home D7); shared with the phone screen. */
export function GraduatedGroup({ habits, rowsOf, hue }: { habits: readonly Task[]; rowsOf: (t: Task) => readonly Task[]; hue: (t: Task) => HueName }) {
  const [graduatedOpen, setGraduatedOpen] = useState(false)
  const model = { graduated: habits, rowsOf }
  return (
    <>
      {habits.length > 0 && (
        <section aria-label={t('Graduated')} data-habit-group="graduated">
          <ListGroupHeader title={t('Graduated')} count={model.graduated.length} countLabel={(n) => t('{n, plural, one {# graduated habit} other {# graduated habits}}', { n })}
            collapsed={!graduatedOpen} onToggle={() => setGraduatedOpen((v) => !v)} />
          {graduatedOpen && (
            <ul className="space-y-0.5">
              {model.graduated.map((x) => (
                <li key={x.id} data-hue={hue(x)} data-graduated={x.id} className="flex min-h-11 items-center gap-3 rounded-control px-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-hue-soft ring-1 ring-hue-solid" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body text-default">{x.title || t('Untitled')}</span>
                    <span className="block text-meta text-muted" data-kept-for>{t('{n, plural, one {Kept for # day} other {Kept for # days}}', { n: keptDays(x, model.rowsOf(x)) })}</span>
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => act(resume(x.id).then((r) => { if (r?.entry) showUndoToast(r.label, r.entry.id) }))} data-resume>{t('Resume')}</Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  )
}

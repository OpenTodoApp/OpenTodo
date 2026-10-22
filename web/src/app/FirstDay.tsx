// "Your first day" (OpenSpec change moments-and-onboarding, design D5; first-run
// "First-day checklist"): the start guide's last view, three steps read from local
// data (lib/firstDay.ts), each with one action that leads to it, plus "Remove sample
// tasks" while samples exist. The sidebar's More group lists "Start guide · n of 3
// done" until every step is done or the entry is hidden (StartGuideEntry).
import { Button, Icon, Menu, MenuItem, MenuSeparator, SidebarItem, Tooltip } from '../ui'
import { doneCount, FIRST_DAY_STEPS, useFirstDay, type FirstDayStep } from '../lib/firstDay'
import { useDemo } from '../lib/demo'
import { useUserPrefsRow } from '../lib/localData'
import { useHasSampleTasks } from '../lib/sampleTasks'
import { openFirstDay } from '../lib/startGuide'
import { firstRunDone, hideStartChecklist, startChecklistHidden } from '../lib/userPrefs'
import { t } from '../lib/i18n'
import { act } from './actionError'
import { installPrompt, useInstallPrompt } from './installPrompt'
import { navigate } from './router'
import { removeSamplesWithUndo } from './sampleActions'

function stepLabel(step: FirstDayStep): string {
  if (step === 'add') return t('Add a task')
  if (step === 'plan') return t('Plan today')
  return t('Get it on another device')
}

export function FirstDayView({ onAddTask, onClose }: { onAddTask: () => void; onClose: () => void }) {
  const state = useFirstDay()
  const samples = useHasSampleTasks()
  const canInstall = useInstallPrompt()
  const actions: Record<FirstDayStep, { label: string; run: () => void }> = {
    add: { label: t('Add a task'), run: onAddTask },
    plan: { label: t('Open Today'), run: () => { navigate({ view: 'today' }); onClose() } },
    device: {
      label: t('Install the app'),
      run: () => {
        if (canInstall) act(installPrompt())
        else { navigate({ view: 'help', page: 'install-app' }); onClose() }
      },
    },
  }
  return (
    <>
      <p className="text-meta text-muted" data-first-day-count>
        {state ? t('{n} of 3 done', { n: doneCount(state) }) : ' '}
      </p>
      <ul className="mt-2 flex flex-col gap-2" data-first-day>
        {FIRST_DAY_STEPS.map((step) => {
          const done = !!state?.[step]
          return (
            <li key={step} className="flex min-h-10 items-center gap-3" data-first-day-step={step} data-done={done || undefined}>
              <Icon name={done ? 'circle-check-big' : 'circle'} className={done ? 'text-success' : 'text-muted'} />
              <span className={`min-w-0 flex-1 text-body ${done ? 'text-muted line-through' : ''}`}>
                {stepLabel(step)}
                <span className="sr-only">{done ? t('Done') : t('Not done yet')}</span>
              </span>
              {!done && <Button size="sm" variant="secondary" data-first-day-action={step} onClick={actions[step].run}>{actions[step].label}</Button>}
            </li>
          )
        })}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="primary" data-first-day-done onClick={onClose}>{t('Done')}</Button>
        {samples && <Button size="sm" variant="ghost" icon="trash-2" data-remove-samples onClick={removeSamplesWithUndo}>{t('Remove sample tasks')}</Button>}
      </div>
    </>
  )
}

/**
 * The sidebar's "Start guide · n of 3 done" entry and whether it shows: once the guide
 * was finished or skipped (before that the guide opens on its own), until every step
 * is done or the entry is hidden on any device, never on the demo.
 */
export function useStartGuideEntry(): { done: number } | null {
  const row = useUserPrefsRow()
  const demo = useDemo()
  const off = !!demo || row === undefined || !firstRunDone(row) || startChecklistHidden(row)
  const state = useFirstDay(!off)
  if (off || !state) return null
  const done = doneCount(state)
  return done >= FIRST_DAY_STEPS.length ? null : { done }
}

export function startGuideEntryLabel(done: number): string {
  return t('Start guide · {n} of 3 done', { n: done })
}

/**
 * The entry in the sidebar's inline More group (phones, the drawer): the row opens
 * "Your first day", its menu holds Hide. The rail shows the icon with the name as a tooltip.
 */
export function StartGuideMoreItem({ collapsed }: { collapsed: boolean }) {
  const entry = useStartGuideEntry()
  if (!entry) return null
  const label = startGuideEntryLabel(entry.done)
  const row = <SidebarItem icon="list-checks" label={label} collapsed={collapsed} onClick={openFirstDay} data-start-guide-entry />
  if (collapsed) return <Tooltip label={label} side="right">{row}</Tooltip>
  return (
    <div className="group relative flex items-center">
      <div className="min-w-0 flex-1">{row}</div>
      <Menu kind="menu" label={t('Menu for the start guide')} title={t('Start guide')} trigger={<Icon name="ellipsis" size="xs" />}
        triggerClassName="touch-target hover-reveal rounded-control px-1.5 py-0.5 text-faint hover:bg-sunken dark:hover:bg-raised" triggerProps={{ 'data-start-guide-menu': true }}>
        <MenuItem icon="eye-off" label={t('Hide')} data-start-guide-hide onSelect={() => act(hideStartChecklist())} />
      </Menu>
    </div>
  )
}

/** The same entry inside the desktop More menu: the entry, then Hide, after the destinations. */
export function StartGuideMoreMenuItems() {
  const entry = useStartGuideEntry()
  if (!entry) return null
  return (
    <>
      <MenuSeparator />
      <MenuItem icon="list-checks" label={t('Start guide')} description={t('{n} of 3 done', { n: entry.done })} data-start-guide-entry onSelect={openFirstDay} />
      <MenuItem icon="eye-off" label={t('Hide the start guide')} data-start-guide-hide onSelect={() => act(hideStartChecklist())} />
    </>
  )
}

// The first run (OpenSpec change ux-overhaul, first-run): the first time an account
// opens the app, the Inbox shows a three-step card instead of the empty state: add
// a first task (quick add is focused, with one example), choose the appearance,
// install the app or skip. Every step is skippable; the card leaves after the third
// step or Skip all and never returns on that account, because its state is an
// ordinary preference op (`first_run`) that syncs to the account's other devices.
// "Show me around" creates one sample project with six tasks as ordinary ops.
import { Button, Icon, type IconName } from '../ui'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { readAppearance, setAppearance, THEME_MODES } from '../lib/appearance'
import { todayISO } from '../lib/dates'
import { db } from '../lib/db'
import { createLabel, findLabelByName } from '../lib/labels'
import { createProject, createSubtask, createTask } from '../lib/ops'
import type { ThemeModePref } from '../lib/types'
import { firstRunDone, setFirstRunDone, USER_PREFS_ID } from '../lib/userPrefs'
import { installPrompt, useInstallPrompt } from './installPrompt'
import { navigate } from './router'

export const SAMPLE_PROJECT_NAME = 'Show me around'

/** Whether the first-run card belongs on screen: a fresh account (no row, or not marked done) with nothing in it yet. */
export function useFirstRun(): boolean {
  const row = useLiveQuery(async () => (await db.userPrefs.get(USER_PREFS_ID)) ?? null, [])
  const taskCount = useLiveQuery(() => db.tasks.filter((t) => !t.deleted_at).count(), [], undefined)
  // Once shown, the card stays through the first task (step one adds it) until it is marked done.
  const shown = useRef(false)
  if (row === undefined || taskCount === undefined) return false
  if (firstRunDone(row)) { shown.current = false; return false }
  if (taskCount === 0) shown.current = true
  return shown.current
}

/**
 * The sample project: six tasks demonstrating a date, a deadline, labels, a
 * subtask, a repeat and a note, created through the same ops as any other data,
 * so they sync and delete like any project. Returns the project id.
 */
export async function createSampleProject(today = todayISO()): Promise<string> {
  const tomorrow = new Date(`${today}T12:00:00`)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const nextWeek = new Date(`${today}T12:00:00`)
  nextWeek.setDate(nextWeek.getDate() + 7)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const project = await createProject({ name: SAMPLE_PROJECT_NAME, color: '#10b981' })
  await createTask({ title: 'A task due today: press c to complete it', project_id: project, due: { date: today } })
  await createTask({ title: 'A task with a deadline: it turns red when late', project_id: project, due: { date: iso(tomorrow) }, deadline: iso(nextWeek) })
  const label = (await findLabelByName('errand'))?.id ?? await createLabel({ name: 'errand' })
  await createTask({ title: 'Labels group tasks across projects: press L to add one', project_id: project, labels: [label] })
  const parent = await createTask({ title: 'A task with a subtask: press a to add another', project_id: project })
  await createSubtask(parent, 'The subtask: complete it and the parent asks to follow')
  await createTask({ title: 'A repeating task: complete it and the next one appears', project_id: project, due: { date: today }, recurrence: 'every week' })
  await createTask({ title: 'A task with notes: open it and write below the title', project_id: project, description: 'Notes take markdown: **bold**, lists, links. Press Esc to leave them.' })
  return project
}

const STEPS: { id: 'task' | 'appearance' | 'install'; title: string; icon: IconName }[] = [
  { id: 'task', title: 'Add your first task', icon: 'plus' },
  { id: 'appearance', title: 'Choose light or dark', icon: 'palette' },
  { id: 'install', title: 'Install the app', icon: 'download' },
]

export function FirstRunCard({ onFocusQuickAdd }: { onFocusQuickAdd: () => void }) {
  const [step, setStep] = useState(0)
  const [sampleOffered, setSampleOffered] = useState(true)
  const row = useLiveQuery(async () => (await db.userPrefs.get(USER_PREFS_ID)) ?? null, [])
  const mode = readAppearance(row ?? null).mode
  const canInstall = useInstallPrompt()
  const taskCount = useLiveQuery(() => db.tasks.filter((t) => !t.deleted_at && !t.parent_id).count(), [], 0)
  // The first step keeps quick add focused, with one example; the first task added moves on.
  useEffect(() => { if (step === 0) onFocusQuickAdd() }, [step, onFocusQuickAdd])
  useEffect(() => { if (step === 0 && taskCount > 0) setStep(1) }, [step, taskCount])
  const next = () => {
    if (step >= STEPS.length - 1) void setFirstRunDone()
    else setStep(step + 1)
  }
  const current = STEPS[step]
  return (
    <section aria-labelledby="first-run-title" data-first-run data-first-run-step={current.id}
      className="my-4 rounded-card border border-default bg-surface p-4 shadow-1">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-on-accent-soft"><Icon name={current.icon} size="md" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-meta text-muted">Step {step + 1} of {STEPS.length}</p>
          <h2 id="first-run-title" className="text-h3 font-semibold text-strong">{current.title}</h2>
          {current.id === 'task' && (
            <p className="mt-1 text-body text-muted">Type a line in the box above and press Enter. Try <em>Call the dentist tomorrow at 3pm</em>: the date and time become part of the task.</p>
          )}
          {current.id === 'appearance' && (
            <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Appearance">
              {THEME_MODES.map((m) => (
                <Button key={m} size="sm" variant={mode === m ? 'primary' : 'secondary'} role="radio" aria-checked={mode === m} data-first-run-mode={m}
                  onClick={() => void setAppearance('theme_mode', m)}>{label(m)}</Button>
              ))}
            </div>
          )}
          {current.id === 'install' && (
            <p className="mt-1 text-body text-muted">Installed, OpenTodo opens in its own window and works offline on your phone, tablet or computer.</p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {current.id === 'install' && (
              <Button size="sm" variant="primary" data-first-run-install onClick={() => {
                if (canInstall) void installPrompt().then(next)
                else { navigate({ view: 'help', page: 'install-app' }); next() }
              }}>{canInstall ? 'Install' : 'How to install'}</Button>
            )}
            <Button size="sm" variant={current.id === 'install' ? 'ghost' : 'secondary'} data-first-run-next onClick={next}>
              {step === STEPS.length - 1 ? 'Skip' : current.id === 'appearance' ? 'Next' : 'Skip this step'}
            </Button>
            {sampleOffered && (
              <Button size="sm" variant="ghost" icon="rocket" data-first-run-sample onClick={() => {
                setSampleOffered(false)
                void createSampleProject().then((id) => navigate({ view: 'project', id }))
              }}>Show me around</Button>
            )}
            <Button size="sm" variant="ghost" className="ml-auto" data-first-run-skip-all onClick={() => void setFirstRunDone()}>Skip all</Button>
          </div>
        </div>
      </div>
    </section>
  )
}

function label(m: ThemeModePref): string {
  return m === 'system' ? 'System' : m === 'light' ? 'Light' : 'Dark'
}

// The first run (OpenSpec changes ux-overhaul, first-run, open-loops-method D10 and
// lean-chrome D3-D5): the first time an account opens the Inbox, a start guide opens
// over it, one step at a time: add a first task (its own quick add, focused, with one
// example; the task lands in the Inbox behind), choose how you work and the
// appearance, install the app or skip. It is a Dialog with placement="sheet": a
// centred card from 640 px, a bottom sheet below, never a row of the list. Every step
// is skippable, and every way of closing it (Close, Escape, the scrim, Skip all)
// finishes it: an ordinary preference op (`first_run`) that syncs to the account's
// other devices, so it never returns on its own. It waits for this device's first
// sync, never opens on the demo, and yields to the owner's welcome note.
// Settings → Account → How you work reopens it (lib/startGuide.ts) at step one; a
// reopened guide writes nothing until a step writes, and closing it only closes it.
// "Show me around" creates one sample project with six tasks as ordinary ops.
import { Button, Dialog } from '../ui'
import { useEffect, useRef, useState } from 'react'
import { readAppearance, setAppearance, THEME_MODES } from '../lib/appearance'
import { logicalToday } from '../lib/dates'
import { useDemo } from '../lib/demo'
import { useHasTask, useLabels, useProjects, useTopLevelTaskCount, useUserPrefsRow } from '../lib/localData'
import { createLabel, findLabelByName } from '../lib/labels'
import { createProject, createSubtask, createTask } from '../lib/ops'
import { closeStartGuide, useStartGuideRequest } from '../lib/startGuide'
import { useSyncStatus } from '../lib/sync'
import type { ThemeModePref, User } from '../lib/types'
import { firstRunDone, setFirstRunDone } from '../lib/userPrefs'
import { setMethodMode, type MethodMode } from '../lib/method/mode'
import { MethodModeChooser } from './method/MethodModeChooser'
import { installPrompt, useInstallPrompt } from './installPrompt'
import { taskDefaults } from './listActions'
import { QuickAdd, type QuickAddInput } from './QuickAdd'
import { navigate, useRoute } from './router'
import { useWelcome } from './WelcomeDialog'
import { t, msg } from '../lib/i18n'
import { act } from './actionError'

export const SAMPLE_PROJECT_NAME = msg('Show me around')

/**
 * Whether the start guide belongs on screen on its own: a fresh account (no row, or
 * not marked done) with nothing in it yet, after this device's first sync (so a
 * seeded sandbox or a second device never shows it before the account's rows
 * arrive), never on the demo, and not while the owner's welcome note is open.
 */
export function useFirstRun(user: Pick<User, 'role' | 'createdAt'>): boolean {
  const row = useUserPrefsRow()
  // Only "is there any task" matters: the scan stops at the first live task instead of
  // counting the whole table on every write (large-list-performance).
  const hasTask = useHasTask()
  const demo = useDemo()
  const synced = useSyncStatus().lastSyncedAt !== null
  const welcome = useWelcome(user)
  // Once shown, the guide stays through the first task (step one adds it) until it is marked done.
  const shown = useRef(false)
  if (demo || !synced || row === undefined || hasTask === undefined) return false
  if (firstRunDone(row)) { shown.current = false; return false }
  // The welcome note comes first; the guide opens once it is closed.
  if (welcome) return false
  if (!hasTask) shown.current = true
  return shown.current
}

/**
 * The sample project: six tasks demonstrating a date, a deadline, labels, a
 * subtask, a repeat and a note, created through the same ops as any other data,
 * so they sync and delete like any project. Returns the project id.
 */
export async function createSampleProject(today = logicalToday()): Promise<string> {
  const tomorrow = new Date(`${today}T12:00:00`)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const nextWeek = new Date(`${today}T12:00:00`)
  nextWeek.setDate(nextWeek.getDate() + 7)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const project = await createProject({ name: t(SAMPLE_PROJECT_NAME) })
  await createTask({ title: t('A task due today: press c to complete it'), project_id: project, due: { date: today } })
  await createTask({ title: t('A task with a deadline: it turns red when late'), project_id: project, due: { date: iso(tomorrow) }, deadline: iso(nextWeek) })
  const label = (await findLabelByName('errand'))?.id ?? await createLabel({ name: 'errand' })
  await createTask({ title: t('Labels group tasks across projects: press L to add one'), project_id: project, labels: [label] })
  const parent = await createTask({ title: t('A task with a subtask: press a to add another'), project_id: project })
  await createSubtask(parent, t('The subtask: complete it and the parent asks to follow'))
  await createTask({ title: t('A repeating task: complete it and the next one appears'), project_id: project, due: { date: today }, recurrence: 'every week' })
  await createTask({ title: t('A task with notes: open it and write below the title'), project_id: project, description: t('Notes take markdown: **bold**, lists, links. Press Esc to leave them.') })
  return project
}

type StepId = 'task' | 'work' | 'install'
const STEPS: { id: StepId; title: string }[] = [
  { id: 'task', get title() { return t('Add your first task') } },
  { id: 'work', get title() { return t('How do you want to work?') } },
  { id: 'install', get title() { return t('Install the app') } },
]

/**
 * The start guide's host, mounted by the Shell beside the welcome note. It opens on
 * its own on the Inbox (useFirstRun), or when Settings asks for it again.
 */
export function FirstRunGuide({ user }: { user: User }) {
  const auto = useFirstRun(user)
  const route = useRoute()
  const requested = useStartGuideRequest()
  const demo = useDemo()
  // A guide that opened itself finishes in any way it closes; a reopened one only closes.
  const self = !requested && auto && route.view === 'inbox'
  // Never on a demo instance (first-run "Three-step first run"), not even when asked for.
  if (demo || (!requested && !self)) return null
  return <StartGuide self={self} userId={user.id} onClose={self ? () => act(setFirstRunDone()) : closeStartGuide} />
}

/** The guide itself; `self` when it opened on its own (the first task from any quick add moves it on). Exported for the stories. */
export function StartGuide({ self, userId, onClose, initialStep = 0 }: { self: boolean; userId?: string; onClose: () => void; initialStep?: number }) {
  const [step, setStep] = useState(initialStep)
  const [sampleOffered, setSampleOffered] = useState(true)
  // Companion is preselected but written only when the user continues (first-run "Three-step first run").
  const [method, setMethod] = useState<MethodMode>('companion')
  const taskCount = useTopLevelTaskCount()
  // On a fresh account the first task, from any quick add, moves the guide on.
  useEffect(() => { if (self && step === 0 && taskCount > 0) setStep(1) }, [self, step, taskCount])
  const next = () => {
    if (step >= STEPS.length - 1) onClose()
    else setStep(step + 1)
  }
  const current = STEPS[step]
  return (
    <Dialog title={current.title} onClose={onClose} placement="sheet" size="md" testId="start-guide">
      <section aria-label={current.title} data-first-run data-first-run-step={current.id}>
        <p className="text-meta text-muted">{t('Step {n} of {count}', { n: step + 1, count: STEPS.length })}</p>
        {current.id === 'task' && <TaskStep userId={userId} onAdded={() => setStep(1)} />}
        {current.id === 'work' && <WorkStep method={method} onMethod={setMethod} />}
        {current.id === 'install' && (
          <p className="mt-1 text-body text-muted">{t('Installed, OpenTodo opens in its own window and works offline on your phone, tablet or computer.')}</p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {current.id === 'install' && <InstallButton next={next} />}
          {current.id === 'work' && (
            <Button size="sm" variant="primary" data-first-run-continue onClick={() => act(setMethodMode(method).then(next))}>{t('Continue')}</Button>
          )}
          <Button size="sm" variant={current.id === 'install' ? 'ghost' : 'secondary'} data-first-run-next onClick={next}>
            {step === STEPS.length - 1 ? t('Skip') : t('Skip this step')}
          </Button>
          {sampleOffered && (
            <Button size="sm" variant="ghost" icon="rocket" data-first-run-sample onClick={() => {
              setSampleOffered(false)
              void createSampleProject().then((id) => navigate({ view: 'project', id }))
            }}>{t('Show me around')}</Button>
          )}
          <Button size="sm" variant="ghost" className="ml-auto" data-first-run-skip-all onClick={onClose}>{t('Skip all')}</Button>
        </div>
      </section>
    </Dialog>
  )
}

/** Step one: the guide's own quick add, focused, creating Inbox tasks behind the guide. */
function TaskStep({ userId, onAdded }: { userId?: string; onAdded: () => void }) {
  const projects = useProjects()
  const labels = useLabels()
  // The Inbox's defaults; attributes typed in the line override them.
  const onAdd = async ({ labels: typed, ...rest }: QuickAddInput) => {
    const { labels: viewLabels, ...defaults } = taskDefaults({ view: 'inbox' }, logicalToday(), userId)
    await createTask({ ...defaults, ...rest, labels: [...new Set([...viewLabels, ...(typed ?? [])])] })
    onAdded()
  }
  return (
    <>
      <p className="mt-1 text-body text-muted">{t.rich('Type a line here and press Enter; it goes to your Inbox. Try <em>Call the dentist tomorrow at 3pm</em>: the date and time become part of the task.', { em: (chunks) => <em>{chunks}</em> })}</p>
      <div className="mt-3 rounded-control border border-default px-2 py-1">
        <QuickAdd autoFocus hideHint placeholder={t('Call the dentist tomorrow at 3pm')} label={t('Add a task')} projects={projects} labels={labels} onAdd={onAdd} />
      </div>
    </>
  )
}

/** Step two: how you work, then light, dark or system. */
function WorkStep({ method, onMethod }: { method: MethodMode; onMethod: (m: MethodMode) => void }) {
  const row = useUserPrefsRow()
  const mode = readAppearance(row ?? null).mode
  return (
    <>
      <div className="mt-2"><MethodModeChooser value={method} onChosen={onMethod} writeOnChoose={false} offerPreselected /></div>
      <p className="mt-3 text-meta text-muted" id="first-run-appearance">{t('Choose light or dark')}</p>
      <div className="mt-1 flex flex-wrap gap-2" role="radiogroup" aria-labelledby="first-run-appearance">
        {THEME_MODES.map((m) => (
          <Button key={m} size="sm" variant={mode === m ? 'primary' : 'secondary'} role="radio" aria-checked={mode === m} data-first-run-mode={m}
            onClick={() => act(setAppearance('theme_mode', m))}>{label(m)}</Button>
        ))}
      </div>
    </>
  )
}

function InstallButton({ next }: { next: () => void }) {
  const canInstall = useInstallPrompt()
  return (
    <Button size="sm" variant="primary" data-first-run-install onClick={() => {
      if (canInstall) void installPrompt().then(next)
      else { navigate({ view: 'help', page: 'install-app' }); next() }
    }}>{canInstall ? t('Install') : t('How to install')}</Button>
  )
}

function label(m: ThemeModePref): string {
  return m === 'system' ? t('System') : m === 'light' ? t('Light') : t('Dark')
}

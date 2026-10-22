// "New workspace" (OpenSpec change workspaces, task 7.3): name, icon and
// colour; it needs a connection (workspaces are server data) and switches the
// device to the new workspace on success. Opened from the switcher, the
// palette and Settings → Workspaces through requestNewWorkspace().
import { type FormEvent, useState, useSyncExternalStore } from 'react'
import { Dialog, Field, HUES, hueFor } from '../ui'
import { actionErrorMessage } from './actionError'
import { hueName } from '../lib/colourNames'
import { t } from '../lib/i18n'
import { useOnline } from '../lib/online'
import { workspaceApi } from '../lib/workspaceApi'
import { switchTo } from '../lib/workspaces'
import { navigate, type Route } from './router'
import { useWorkspaceFollow } from './workspaceNav'

let open = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

/** Opens the dialog (rendered once by the shell). */
export function requestNewWorkspace(): void {
  open = true
  emit()
}

function useRequested(): boolean {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn) }, () => open, () => false)
}

/** The palette's colours as radio buttons, plus "No colour". */
export function WorkspaceColours({ value, onPick }: { value: string; onPick: (hex: string) => void }) {
  const current = value ? hueFor(value) : null
  return (
    <div role="radiogroup" aria-label={t('Colour')} className="flex flex-wrap gap-1" data-workspace-colours>
      <button type="button" role="radio" aria-checked={current === null} aria-label={t('No colour')}
        className="touch-target inline-flex items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-focus" onClick={() => onPick('')}>
        <span className={`block h-5 w-5 rounded-full border border-dashed border-default ${current === null ? 'ring-2 ring-accent ring-offset-1 ring-offset-surface' : ''}`} />
      </button>
      {HUES.map((h) => (
        <button key={h.name} type="button" role="radio" aria-checked={h.name === current} aria-label={t('Colour {name}', { name: hueName(h.name) })}
          className="touch-target inline-flex items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-focus" onClick={() => onPick(h.hex)}>
          <span data-hue={h.name} className={`block h-5 w-5 rounded-full bg-hue-solid ${h.name === current ? 'ring-2 ring-accent ring-offset-1 ring-offset-surface' : ''}`} />
        </button>
      ))}
    </div>
  )
}

/** The dialog itself; `onDone` closes it (stories and tests render it directly). */
export function NewWorkspaceForm({ onDone }: { onDone: () => void }) {
  const online = useOnline()
  const [name, setName] = useState('')
  const [color, setColor] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setError(t('Please enter a name'))
    setBusy(true)
    try {
      const ws = await workspaceApi.create({ name: name.trim(), ...(color ? { color } : {}) })
      await switchTo(ws.id)
      navigate({ view: 'inbox' })
      onDone()
    } catch (err) {
      setError(actionErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog title={t('New workspace')} onClose={onDone} testId="new-workspace">
      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        <p className="text-meta text-muted">{t('A workspace has its own projects, labels and filters, and its own people. Projects stay private until you share them.')}</p>
        <Field label={t('Name')} error={error ?? undefined}>
          <input className="ui-input" autoFocus maxLength={60} value={name} disabled={!online} onChange={(e) => { setName(e.target.value); setError(null) }} />
        </Field>
        <Field label={t('Colour')}>
          <WorkspaceColours value={color} onPick={setColor} />
        </Field>
        {!online && <p role="status" className="text-meta text-muted" data-offline-note>{t('Creating a workspace needs a connection to your server.')}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--md text-body" onClick={onDone}>{t('Cancel')}</button>
          <button type="submit" className="ui-btn ui-btn--primary ui-btn--md text-body" disabled={!online || busy}>{t('Create')}</button>
        </div>
      </form>
    </Dialog>
  )
}

/** Mounted once by the shell; shows the form while requested. */
export function NewWorkspaceDialog() {
  const requested = useRequested()
  if (!requested) return null
  return <NewWorkspaceForm onDone={() => { open = false; emit() }} />
}

/** The shell's workspace plumbing in one element: following entities across workspaces and the New workspace dialog. */
export function WorkspaceHost({ route, panelTask }: { route: Route; panelTask: string | null }) {
  useWorkspaceFollow(route, panelTask)
  return <NewWorkspaceDialog />
}

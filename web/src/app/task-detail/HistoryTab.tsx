// History tab of the task panel (OpenSpec task-detail-redesign D7; trash-and-history
// "Revision history", "Restore a previous value", "Readable versions", "Readable
// field changes"): change sets from the server's op log as versions with a summary,
// readable diffs and restore. Read live from the server; offline it says so and
// shows nothing stale. Loaded lazily with its tab.
import { useLiveQuery } from 'dexie-react-hooks'
import { Skeleton } from '../../ui'
import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { isNetworkError } from '../../lib/api'
import { zoneCity } from '../../lib/dates'
import { db } from '../../lib/db'
import { canRestoreField, deviceLabel, fetchHistory, fieldLabel, formatValue, restoreValue } from '../../lib/history'
import { summarizeVersion, toVersions, type Version, type VersionChange } from '../../lib/historyVersions'
import { useOnline } from '../../lib/online'
import { getDeviceId } from '../../lib/ops'
import { currentUserId, memberName } from '../../lib/sharing'
import { syncNow } from '../../lib/sync'
import type { ChangeSet, Label, Membership } from '../../lib/types'
import { Avatar } from '../../ui'
import { Button } from '../../ui'
import { Badge } from '../../ui'
import { Icon } from '../../ui'
import { ConfirmDialog } from '../../ui'
import { EmptyState } from '../../ui'
import type { HueName } from '../../ui'
import { useDateTimeFormat } from '../DateTimePrefsProvider'
import { RelativeTime } from './RelativeTime'

const PRIORITY_HUE: Record<number, HueName> = { 1: 'red', 2: 'orange', 3: 'blue', 4: 'slate' }
const EMPTY_REF: Record<string, string> = { project_id: 'Inbox', parent_id: 'No parent', section_id: 'No section', assignee_id: 'Unassigned' }

/** "due date" → "Due date": field names as row labels. */
export function changeLabel(field: string): string {
  const l = field === 'due' ? 'due date' : field === 'description' || field === 'notes_doc' ? 'notes' : field === 'completed_at' ? 'completed'
    : field === 'deleted_at' ? 'deleted' : field === 'estimate_minutes' ? 'estimate' : fieldLabel(field)
  return l[0].toUpperCase() + l.slice(1)
}

export interface HistoryViewProps {
  state: 'idle' | 'loading' | 'offline' | 'error' | 'empty'
  versions: Version[]
  /** Who and where: "You · this device", "Ana · phone". */
  author: (v: Version) => { id: string; name: string; device: string }
  /** Resolves a reference id (project, section, parent, assignee) to a name. */
  refName: (field: string, id: string) => string | undefined
  labels: Map<string, Label>
  readOnly: boolean
  canLoadOlder: boolean
  onLoadOlder: () => void
  onRestoreValue: (field: string, value: unknown) => Promise<unknown>
  onRestoreVersion: (v: Version) => Promise<unknown>
  message?: string | null
  now?: number
  /** Versions shown expanded at first (stories). */
  openIds?: readonly string[]
}

function Value({ change, value, refName, labels }: { change: VersionChange; value: unknown } & Pick<HistoryViewProps, 'refName' | 'labels'>): ReactNode {
  const dt = useDateTimeFormat()
  const [showText, setShowText] = useState(false)
  const f = change.field
  if (f in EMPTY_REF) return value == null || value === '' ? EMPTY_REF[f] : typeof value === 'string' ? refName(f, value) ?? 'unknown' : String(value)
  if (f === 'due') {
    if (!value || typeof value !== 'object') return 'No date'
    const d = value as { date?: string; time?: string; tz?: string }
    if (!d.date) return 'No date'
    return [dt.formatDate(d.date, 'compact'), d.time ? dt.formatTime(d.time) : '', d.tz ? `(${zoneCity(d.tz)})` : ''].filter(Boolean).join(' ')
  }
  if (f === 'priority' && typeof value === 'number') return <Badge hue={PRIORITY_HUE[value] ?? 'slate'}>P{value}</Badge>
  if (f === 'labels' && Array.isArray(value)) {
    if (!value.length) return 'No labels'
    return (
      <span className="inline-flex flex-wrap gap-1">
        {value.map((id) => { const l = labels.get(String(id)); return <Badge key={String(id)} color={l?.color} tone="solid">{l?.name ?? 'Deleted label'}</Badge> })}
      </span>
    )
  }
  if (f === 'notes_doc') return 'Notes edited'
  if (f === 'description') {
    if (!value) return 'No notes'
    return (
      <span>
        Notes edited{' '}
        <button type="button" className="text-meta text-accent underline" aria-expanded={showText} onClick={() => setShowText((v) => !v)}>{showText ? 'Hide text' : 'Show text'}</button>
        {showText && <span className="user-text mt-1 block whitespace-pre-wrap text-meta">{String(value)}</span>}
      </span>
    )
  }
  if ((f === 'completed_at' || f === 'deleted_at') && value == null) return 'No'
  if (f.endsWith('_at') && typeof value === 'number') return dt.formatInstant(value, 'datetime')
  return formatValue(f, value)
}

/** Plain text of a value, for the restore button's accessible name. */
function valueText(field: string, value: unknown, refName: HistoryViewProps['refName']): string {
  if (field in EMPTY_REF) return value == null || value === '' ? EMPTY_REF[field] : refName(field, String(value)) ?? 'unknown'
  return formatValue(field, value)
}

function VersionItem({ v, props }: { v: Version; props: HistoryViewProps }) {
  const { author, refName, labels, readOnly, onRestoreValue, onRestoreVersion, now } = props
  const [open, setOpen] = useState(() => !!props.openIds?.includes(v.id))
  const [confirming, setConfirming] = useState(false)
  const who = author(v)
  const summary = summarizeVersion(v)
  const restorable = v.changes.filter((c) => !c.lost && canRestoreField('task', c.field))
  return (
    <div data-version={v.id}>
      <div className="flex items-start gap-3">
        <Avatar id={who.id || 'unknown'} name={who.name || who.device} size="md" />
        <div className="min-w-0 flex-1">
          <button type="button" aria-expanded={open} onClick={() => setOpen((x) => !x)}
            className="inline-flex max-w-full items-start gap-1 rounded-chip text-left text-body font-medium text-default hover:underline focus-visible:outline-2 focus-visible:outline-focus">
            <Icon name="chevron-right" size="xs" className={`mt-1 shrink-0 transition-transform duration-(--duration-ui) ${open ? 'rotate-90' : ''}`} />
            <span>{summary}</span>
          </button>
          <div className="text-meta text-muted">
            {who.name ? `${who.name} · ` : ''}{who.device} · <RelativeTime ts={v.ts} now={now} />
          </div>
        </div>
      </div>
      {open && (
        <div className="ml-11 mt-2 space-y-2">
          <ul className="space-y-2" aria-label={`Changes: ${summary}`}>
            {v.changes.map((c) => (
              <li key={c.opIds.join(':')} className={`rounded-control border p-2 text-body ${c.lost ? 'border-dashed border-input bg-sunken' : 'border-default'}`} data-change={c.field}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium text-default">{changeLabel(c.field)}</span>
                  {c.lost && <Badge hue="slate" title="Arrived after a newer change and was never applied">not applied</Badge>}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 break-words">
                  <del className="text-muted line-through decoration-1"><Value change={c} value={c.from} refName={refName} labels={labels} /></del>
                  <Icon name="arrow-right" size="xs" className="shrink-0 text-faint" />
                  <ins className="font-medium text-default no-underline"><Value change={c} value={c.to} refName={refName} labels={labels} /></ins>
                </div>
                {!readOnly && canRestoreField('task', c.field) && (
                  <Button variant="ghost" size="sm" className="mt-1" icon="rotate-ccw"
                    aria-label={`Restore ${changeLabel(c.field).toLowerCase()} to ${valueText(c.field, c.to, refName)}`}
                    onClick={() => onRestoreValue(c.field, c.to)}>
                    Restore this value
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {!readOnly && restorable.length > 0 && (
            <Button variant="secondary" size="sm" icon="rotate-ccw" onClick={() => setConfirming(true)}>Restore this version</Button>
          )}
        </div>
      )}
      {confirming && (
        <ConfirmDialog tone="default" title="Restore this version?" confirmLabel="Restore"
          consequence={(
            <div className="space-y-2">
              <p>These fields go back to this version’s values:</p>
              <ul className="list-disc pl-5">{restorable.map((c) => <li key={c.field}>{changeLabel(c.field)}</li>)}</ul>
              <p className="text-meta text-muted">Each field is restored as its own change, recorded in the history.</p>
            </div>
          )}
          onConfirm={() => onRestoreVersion(v)} onCancel={() => setConfirming(false)} />
      )}
    </div>
  )
}

export function HistoryView(props: HistoryViewProps) {
  const { state, versions, canLoadOlder, onLoadOlder, message } = props
  if (state === 'offline') return <EmptyState icon="history" title="History needs a connection to the server" body="The history is read from the server; reconnect to see it." />
  if (state === 'empty') return <EmptyState icon="history" title="No history on the server yet" body="Changes appear here once this task has synced." />
  return (
    <div className="space-y-3 text-body">
      {state === 'error' && <p role="alert" className="text-meta text-danger">History could not be loaded.</p>}
      {state === 'loading' && versions.length === 0 && <Skeleton shape="line" count={4} label="Loading history" />}
      {message && <p role="status" className="text-meta text-success">{message}</p>}
      {versions.length > 0 && (
        <ol className="space-y-4" aria-label="Versions">
          {versions.map((v) => <li key={v.id}><VersionItem v={v} props={props} /></li>)}
        </ol>
      )}
      {canLoadOlder && <Button variant="ghost" size="sm" onClick={onLoadOlder}>Older changes</Button>}
    </div>
  )
}

export interface HistoryTabProps {
  taskId: string
  readOnly: boolean
  /** Called with the task id after a restore (a task moved across scopes gets a new id). */
  onRestored?: (id: string) => void
}

/** Container: pages the server history and restores fields or whole versions. */
export function HistoryTab({ taskId, readOnly, onRestored }: HistoryTabProps) {
  const online = useOnline()
  const [sets, setSets] = useState<ChangeSet[]>([])
  const [before, setBefore] = useState<number | undefined>()
  const [state, setState] = useState<HistoryViewProps['state']>('idle')
  const [device, setDevice] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const me = useLiveQuery(() => currentUserId(), [], null)
  const memberships = useLiveQuery(() => db.memberships.toArray(), [], [] as Membership[])
  const labels = useLiveQuery(async () => new Map((await db.labels.toArray()).map((l) => [l.id, l])), [], new Map<string, Label>())
  const refNames = useLiveQuery(async () => {
    const m = new Map<string, string>()
    for (const ms of await db.memberships.toArray()) for (const u of ms.members) m.set(`assignee_id:${u.userId}`, u.name || u.email)
    for (const p of await db.projects.toArray()) m.set(`project_id:${p.id}`, p.name)
    for (const x of await db.sections.toArray()) m.set(`section_id:${x.id}`, x.name)
    const parents = [...new Set(sets.flatMap((cs) => cs.changes.filter((c) => c.field === 'parent_id').flatMap((c) => [c.from, c.to]).filter((v): v is string => typeof v === 'string')))]
    for (const t of await db.tasks.bulkGet(parents)) if (t) m.set(`parent_id:${t.id}`, t.title || 'Untitled')
    return m
  }, [sets], new Map<string, string>())

  const load = useCallback(async (older?: number) => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setSets([])
      setState('offline')
      return
    }
    setState('loading')
    try {
      const page = await fetchHistory('task', taskId, older)
      setSets((prev) => (older ? [...prev, ...page.changeSets] : page.changeSets))
      setBefore(page.more ? page.before : undefined)
      setState('idle')
    } catch (err) {
      setSets([])
      if ((err as { status?: number }).status === 404) setState('empty')
      else if (isNetworkError(err)) setState('offline')
      else setState('error')
    }
  }, [taskId])

  useEffect(() => { void getDeviceId().then(setDevice) }, [])
  useEffect(() => {
    setSets([])
    setBefore(undefined)
    setMessage(null)
    void load()
  }, [load, online])

  const memberMap = new Map(memberships.map((m) => [m.projectId, m]))
  // A public link's tick is written as the link's creator; it reads as the link alone (public-links D6).
  const author = (v: Version) => v.device.startsWith('public:') ? { id: v.device, name: '', device: deviceLabel(v, device) } : ({
    id: v.userId,
    name: v.userId && v.userId === me ? 'You' : memberName(v.userId, memberMap) ?? 'Someone',
    // The name is shown on its own; deviceLabel would add it again for someone else's change.
    device: deviceLabel(v, device),
  })

  async function afterRestore(id: string, what: string) {
    setMessage(`Restored ${what}.`)
    onRestored?.(id)
    // The restore is a new op: once it reached the server it is in the history too.
    await syncNow()
    await load()
  }

  async function restoreOne(field: string, value: unknown) {
    setMessage(null)
    try {
      const id = await restoreValue('task', taskId, field, value)
      await afterRestore(id, changeLabel(field).toLowerCase())
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    }
  }

  // Sequential, so every op comes from this device within the same moment; a
  // restore that moves the task across scopes returns a new id the rest follows.
  async function restoreVersion(v: Version) {
    setMessage(null)
    let id = taskId
    const fields = v.changes.filter((c) => !c.lost && canRestoreField('task', c.field))
    for (const c of fields) id = await restoreValue('task', id, c.field, c.to)
    await afterRestore(id, fields.map((c) => changeLabel(c.field).toLowerCase()).join(', '))
  }

  return (
    <HistoryView state={state} versions={toVersions(sets)} author={author} refName={(f, id) => refNames.get(`${f}:${id}`)} labels={labels}
      readOnly={readOnly} canLoadOlder={before !== undefined} onLoadOlder={() => void load(before)}
      onRestoreValue={restoreOne} onRestoreVersion={restoreVersion} message={message} />
  )
}

export default HistoryTab

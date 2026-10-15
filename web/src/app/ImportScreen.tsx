import { Icon } from '../ui'
import { ProjectPickerField } from './ProjectPickerField'
import { useLiveQuery } from 'dexie-react-hooks'
import { HelpLink } from './help/HelpLink'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError, isNetworkError } from '../lib/api'
import { db } from '../lib/db'
import { applyImportViewHints } from '../lib/sections'
import { useOnline } from '../lib/online'
import { syncNow, useSyncStatus } from '../lib/sync'
import {
  IMPORT_FORMATS, type ImportFormat, type ImportJob, type ImportOptions, type ImportPreview, type ImportRow, type Project,
} from '../lib/types'
import { navigate } from './router'
import { useDateTimeFormat } from './DateTimePrefsProvider'

/** Last fetched job list, kept per device so past summaries stay readable offline. */
const JOBS_CACHE_KEY = 'opentodo.importJobs'
const POLL_MS = 800
/** Rows rendered in the preview table; the totals always count every row. */
const TABLE_LIMIT = 500

const FORMAT_LABELS: Record<ImportFormat, string> = {
  opentodo: 'OpenTodo export (JSON)',
  'todoist-backup': 'Todoist backup (ZIP)',
  'todoist-csv': 'Todoist project (CSV)',
  'things-db': 'Things 3 database',
  'ticktick-csv': 'TickTick backup (CSV)',
  'linear-csv': 'Linear export (CSV)',
  'json-items': 'JSON: projects / sections / items',
  'json-lists': 'JSON: lists of tasks',
  'json-generic': 'JSON: task list',
  csv: 'CSV',
}

const OUTCOME_STYLE: Record<ImportRow['outcome'], string> = {
  create: 'text-success',
  update: 'text-info',
  skip: 'text-muted',
  error: 'text-danger',
}

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

function timeZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
  try {
    return intl.supportedValuesOf?.('timeZone') ?? []
  } catch {
    return []
  }
}

function readCachedJobs(): ImportJob[] | null {
  try {
    const raw = localStorage.getItem(JOBS_CACHE_KEY)
    return raw ? (JSON.parse(raw) as ImportJob[]) : null
  } catch {
    return null
  }
}

function cacheJobs(jobs: ImportJob[]) {
  try {
    localStorage.setItem(JOBS_CACHE_KEY, JSON.stringify(jobs))
  } catch {
    // Storage may be unavailable (private mode); the list is only a convenience.
  }
}

export const DEFAULT_OPTIONS: Required<Omit<ImportOptions, 'format' | 'targetProject'>> = {
  timeZone: 'UTC', sections: 'section', duplicates: 'skip', errors: 'skip_rows', existing: 'skip',
}

export interface ImportViewProps {
  offline: boolean
  fileName: string | null
  format: ImportFormat | ''
  options: typeof DEFAULT_OPTIONS & { targetProject: string }
  projects: Project[]
  zones: string[]
  preview: ImportPreview | null
  busy: boolean
  error: string | null
  job: ImportJob | null
  jobs: ImportJob[] | null
  onPickFile: (file: File | null) => void
  onFormat: (format: ImportFormat | '') => void
  onOption: <K extends keyof ImportViewProps['options']>(key: K, value: ImportViewProps['options'][K]) => void
  onPreview: () => void
  onStart: () => void
  onUndo: (job: ImportJob) => void
}

function Totals({ t }: { t: ImportPreview['totals'] }) {
  const parts = [
    `${t.create} to create`, t.update ? `${t.update} to update` : '', `${t.skip} skipped`, `${t.error} with errors`,
    t.possibleDuplicates ? `${t.possibleDuplicates} possible duplicates` : '',
    t.newProjects ? `${t.newProjects} new projects` : '', t.newLabels ? `${t.newLabels} new labels` : '',
    t.newSections ? `${t.newSections} new sections` : '', t.recurring ? `${t.recurring} recurring` : '',
    t.reminders ? `${t.reminders} reminders` : '', t.deadlines ? `${t.deadlines} with deadlines` : '',
  ].filter(Boolean)
  return <p className="text-sm text-muted">{t.rows} rows: {parts.join(' · ')}</p>
}

function jobSummary(j: ImportJob): string {
  const t = j.totals
  const base = j.status === 'running'
    ? `writing ${t.written}/${t.entities}`
    : `${t.create} created${t.update ? `, ${t.update} updated` : ''}, ${t.skip} skipped, ${t.error} errors`
  return `${FORMAT_LABELS[j.format] ?? j.format} · ${base}`
}

/** Pure view: every state of the Import screen renders from props (tested without a DOM). */
export function ImportView(p: ImportViewProps) {
  const dt = useDateTimeFormat()
  const { options: o } = p
  const disabled = p.offline || p.busy
  const isOwn = (p.format || p.preview?.format) === 'opentodo'
  const actionable = p.preview ? p.preview.totals.create + p.preview.totals.update : 0
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8">
      <section>
        <button className="btn-ghost -ml-3 text-xs" onClick={() => navigate({ view: 'settings', section: 'data' })}><Icon name="arrow-left" />Data settings</button>
        <div className="flex items-center justify-between gap-2"><h1 className="text-xl font-semibold">Import data</h1><HelpLink screen="import" topic="Importing data" /></div>
        <p className="mt-1 text-sm text-muted">
          Bring in tasks from an OpenTodo export, a CSV file or another task manager's JSON export. You see a preview first;
          nothing is written until you confirm, and every import can be undone. Import runs on your server, so it needs a connection.
          Help explains the formats and options.
        </p>
      </section>

      {p.offline && (
        <p role="status" className="rounded-md border border-warning bg-warning-soft p-3 text-sm text-on-warning-soft">
          You are offline. Import needs a connection to your server; the file picker is disabled until you are back online.
        </p>
      )}

      <section className="space-y-3">
        <label className="block text-sm font-medium" htmlFor="import-file">File</label>
        <input id="import-file" type="file" accept=".json,.csv,.txt,application/json,text/csv" disabled={disabled}
          className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-sunken file:px-3 file:py-1.5 file:text-sm"
          onChange={(e) => p.onPickFile(e.target.files?.[0] ?? null)} />

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-muted">Format</span>
            <select className="input" value={p.format} disabled={disabled} onChange={(e) => p.onFormat(e.target.value as ImportFormat | '')}>
              <option value="">Detect automatically{p.preview && !p.format ? ` (${FORMAT_LABELS[p.preview.format]})` : ''}</option>
              {IMPORT_FORMATS.map((f) => <option key={f} value={f}>{FORMAT_LABELS[f]}</option>)}
            </select>
          </label>
          <div className="text-sm">
            <span className="mb-1 block text-muted" aria-hidden>Tasks without a project go to</span>
            <ProjectPickerField label="Tasks without a project go to" projects={p.projects} value={o.targetProject || null} disabled={disabled}
              onChange={(id) => p.onOption('targetProject', id ?? '')} rankContext="import.target" />
          </div>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Time zone for date-times with a zone</span>
            <input className="input" list="import-zones" value={o.timeZone} disabled={disabled} onChange={(e) => p.onOption('timeZone', e.target.value)} />
            <datalist id="import-zones">{p.zones.map((z) => <option key={z} value={z} />)}</datalist>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Sections</span>
            <select className="input" value={o.sections} disabled={disabled} onChange={(e) => p.onOption('sections', e.target.value as 'section' | 'label' | 'ignore')}>
              <option value="section">Keep as sections</option>
              <option value="label">Turn into labels</option>
              <option value="ignore">Ignore</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Possible duplicates</span>
            <select className="input" value={o.duplicates} disabled={disabled} onChange={(e) => p.onOption('duplicates', e.target.value as 'skip' | 'import')}>
              <option value="skip">Skip them</option>
              <option value="import">Import them anyway</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Rows with errors</span>
            <select className="input" value={o.errors} disabled={disabled} onChange={(e) => p.onOption('errors', e.target.value as 'skip_rows' | 'abort')}>
              <option value="skip_rows">Skip those rows</option>
              <option value="abort">Abort the whole import</option>
            </select>
          </label>
          {isOwn && (
            <label className="text-sm">
              <span className="mb-1 block text-muted">Items that already exist</span>
              <select className="input" value={o.existing} disabled={disabled} onChange={(e) => p.onOption('existing', e.target.value as 'skip' | 'overwrite')}>
                <option value="skip">Keep mine (skip)</option>
                <option value="overwrite">Overwrite changed fields</option>
              </select>
            </label>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-secondary" disabled={disabled || !p.fileName} onClick={p.onPreview}>
            {p.preview ? 'Refresh preview' : 'Preview'}
          </button>
          <button className="btn-primary" disabled={disabled || !p.preview || actionable === 0 || p.job?.status === 'running'} onClick={p.onStart}>
            Import {actionable} item{actionable === 1 ? '' : 's'}
          </button>
          {p.busy && <span className="text-xs text-faint">Working…</span>}
        </div>
        {p.error && <p role="alert" className="text-sm text-danger">{p.error}</p>}
      </section>

      {p.job && (
        <section aria-live="polite" className="rounded-md border border-default p-3 text-sm">
          <p className="font-medium">
            {p.job.status === 'running' ? 'Importing…' : p.job.status === 'done' ? 'Import finished' : p.job.status === 'failed' ? 'Import failed' : 'Import undone'}
          </p>
          <p className="text-muted">{jobSummary(p.job)}</p>
          {p.job.status === 'running' && p.job.totals.entities > 0 && (
            <progress className="mt-2 w-full" max={p.job.totals.entities} value={p.job.totals.written} />
          )}
          {p.job.message && <p className="mt-1 text-danger">{p.job.message}</p>}
        </section>
      )}

      {p.preview && (
        <section className="space-y-2">
          <h2 className="font-semibold">
            Preview · {FORMAT_LABELS[p.preview.format]}{p.preview.version ? ` v${p.preview.version}` : ''}
          </h2>
          <Totals t={p.preview.totals} />
          {p.preview.notes?.map((n) => <p key={n} className="text-sm text-warning">{n}</p>)}
          {p.preview.columns && (
            <p className="text-xs text-muted">
              Columns used: {p.preview.columns.recognised.join(', ') || 'none'}
              {p.preview.columns.ignored.length > 0 && <> · ignored: {p.preview.columns.ignored.join(', ')}</>}
            </p>
          )}
          <div className="max-h-[50dvh] overflow-auto rounded-md border border-default" data-scroll-x>
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-canvas text-xs text-muted">
                <tr><th className="px-2 py-1">Row</th><th className="px-2 py-1">Title</th><th className="px-2 py-1">Project</th><th className="px-2 py-1">Outcome</th><th className="px-2 py-1">Details</th></tr>
              </thead>
              <tbody>
                {p.preview.rows.slice(0, TABLE_LIMIT).map((r, i) => (
                  <tr key={`${r.sourceId ?? ''}-${i}`} className="border-t border-default align-top">
                    <td className="px-2 py-1 text-xs text-faint">{r.file ? `${r.file}:${r.row ?? ''}` : r.row ?? r.sourceId}</td>
                    <td className="px-2 py-1">{r.kind !== 'task' && <span className="mr-1 text-xs text-faint">{r.kind}</span>}{r.title || <em className="text-faint">untitled</em>}</td>
                    <td className="px-2 py-1 text-muted">{r.project}</td>
                    <td className={`px-2 py-1 font-medium ${OUTCOME_STYLE[r.outcome]}`}>{r.outcome}</td>
                    <td className="px-2 py-1 text-xs text-muted">
                      {r.reason && <div className={r.outcome === 'error' ? 'text-danger' : ''}>{r.reason.replace(/_/g, ' ')}</div>}
                      {r.warnings?.map((w) => <div key={w} className="text-warning">{w}</div>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(p.preview.truncated || p.preview.rows.length > TABLE_LIMIT) && (
            <p className="text-xs text-faint">Showing the first rows; rows with errors, skips and warnings are listed first. The totals count every row.</p>
          )}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-semibold">Past imports</h2>
        {p.jobs === null && <p className="text-sm text-faint">{p.offline ? 'No imports loaded yet.' : 'Loading…'}</p>}
        {p.jobs && p.jobs.length === 0 && <p className="text-sm text-faint">No imports yet.</p>}
        <ul className="divide-y divide-(--ot-border)">
          {p.jobs?.map((j) => (
            <li key={j.id} className="flex items-center gap-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p>
                  <span className="mr-2 rounded bg-sunken dark:bg-raised px-1.5 py-0.5 text-xs">{j.status}</span>
                  {dt.formatInstant(j.createdAt, 'datetime')}
                </p>
                <p className="truncate text-xs text-muted">{jobSummary(j)}{j.message ? ` · ${j.message}` : ''}</p>
              </div>
              {(j.status === 'done' || j.status === 'failed') && (
                <button className="btn-danger text-xs" disabled={disabled} onClick={() => p.onUndo(j)}>Undo</button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

/** Settings → Import: owns the state, talks to the server and polls the running job. */
export function ImportScreen() {
  const online = useOnline()
  const sync = useSyncStatus()
  const offline = !online || sync.state === 'offline'
  const projects = useLiveQuery(
    () => db.projects.filter((pr) => !pr.deleted_at && !pr.archived).toArray().then((l) => l.sort((a, b) => a.name.localeCompare(b.name))),
    [], [] as Project[],
  )
  const [file, setFile] = useState<File | null>(null)
  const [format, setFormat] = useState<ImportFormat | ''>('')
  const [options, setOptions] = useState<ImportViewProps['options']>({ ...DEFAULT_OPTIONS, timeZone: browserTimeZone(), targetProject: '' })
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [job, setJob] = useState<ImportJob | null>(null)
  const [jobs, setJobs] = useState<ImportJob[] | null>(() => readCachedJobs())
  const [zones] = useState(timeZones)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadJobs = useCallback(async () => {
    try {
      const res = await api.listImportJobs()
      setJobs(res.jobs)
      cacheJobs(res.jobs)
    } catch (err) {
      if (!isNetworkError(err)) setError((err as ApiError).message)
    }
  }, [])

  useEffect(() => {
    if (!offline) void loadJobs()
  }, [offline, loadJobs])
  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current) }, [])

  function requestOptions(): ImportOptions {
    const out: ImportOptions = {
      timeZone: options.timeZone, sections: options.sections, duplicates: options.duplicates, errors: options.errors, existing: options.existing,
    }
    if (format) out.format = format
    if (options.targetProject) out.targetProject = options.targetProject
    return out
  }

  function describe(err: unknown): string {
    if (isNetworkError(err)) return 'The server could not be reached. Import needs a connection.'
    return (err as ApiError).message
  }

  async function runPreview(f: File | null = file) {
    if (!f) return
    setBusy(true)
    setError(null)
    try {
      setPreview(await api.previewImport(f, f.name, requestOptions()))
    } catch (err) {
      setPreview(null)
      setError(describe(err))
    } finally {
      setBusy(false)
    }
  }

  function poll(id: string) {
    pollRef.current = setTimeout(async () => {
      try {
        const { job: j } = await api.getImportJob(id)
        setJob(j)
        if (j.status === 'running') {
          poll(id)
          return
        }
        // Devices are woken over the event stream; pull right away on this one too.
        void syncNow()
        await loadJobs()
        setPreview(null)
      } catch (err) {
        if (isNetworkError(err)) poll(id)
        else setError(describe(err))
      }
    }, POLL_MS)
  }

  async function start() {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const { job: j } = await api.startImport(file, file.name, requestOptions())
      await applyImportViewHints(j.viewHints)
      setJob(j)
      poll(j.id)
      void loadJobs()
    } catch (err) {
      setError(describe(err))
    } finally {
      setBusy(false)
    }
  }

  async function undo(j: ImportJob) {
    const created = j.totals.create + j.totals.newProjects + j.totals.newLabels
    if (!window.confirm(`Undo this import? The ${created} item(s) it created will be deleted on every device. Items it updated are kept.`)) return
    setBusy(true)
    setError(null)
    try {
      const res = await api.undoImport(j.id)
      if (job?.id === j.id) setJob(res.job)
      void syncNow()
      await loadJobs()
    } catch (err) {
      setError(describe(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ImportView
      offline={offline}
      fileName={file?.name ?? null}
      format={format}
      options={options}
      projects={projects}
      zones={zones}
      preview={preview}
      busy={busy}
      error={error}
      job={job}
      jobs={jobs}
      onPickFile={(f) => {
        setFile(f)
        setPreview(null)
        setJob(null)
        if (f) void runPreview(f)
      }}
      onFormat={(f) => { setFormat(f); setPreview(null) }}
      onOption={(key, value) => { setOptions((cur) => ({ ...cur, [key]: value })); setPreview(null) }}
      onPreview={() => void runPreview()}
      onStart={() => void start()}
      onUndo={(j) => void undo(j)}
    />
  )
}

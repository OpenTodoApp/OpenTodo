import { ConfirmDialog, PageBody, PageHeader } from '../ui'
import { Skeleton } from '../ui'
import { requestTemplateDialog } from './TemplateDialogs'
import { ProjectPickerField } from './ProjectPickerField'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiError, isNetworkError } from '../lib/api'
import { useProjects } from '../lib/localData'
import { visibleProjects } from '../lib/projects'
import { applyImportViewHints } from '../lib/sections'
import { useOnline } from '../lib/online'
import { syncNow, useSyncStatus } from '../lib/sync'
import {
  IMPORT_FORMATS, type ImportFormat, type ImportJob, type ImportOptions, type ImportPreview, type ImportRow, type Project,
} from '../lib/types'
import { navigate } from './router'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { t, msg, translatedMap } from '../lib/i18n'

/** Last fetched job list, kept per device so past summaries stay readable offline. */
const JOBS_CACHE_KEY = 'opentodo.importJobs'
const POLL_MS = 800
/** Rows rendered in the preview table; the totals always count every row. */
const TABLE_LIMIT = 500

const FORMAT_LABELS = translatedMap<ImportFormat>({
  opentodo: msg('OpenTodo export (JSON)'),
  'todoist-backup': msg('Todoist backup (ZIP)'),
  'todoist-csv': msg('Todoist project (CSV)'),
  'things-db': msg('Things 3 database'),
  'ticktick-csv': msg('TickTick backup (CSV)'),
  'linear-csv': msg('Linear export (CSV)'),
  'json-items': msg('JSON: projects / sections / items'),
  'json-lists': msg('JSON: lists of tasks'),
  'json-generic': msg('JSON: task list'),
  csv: 'CSV',
})

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

function Totals({ t: item }: { t: ImportPreview['totals'] }) {
  const parts = [
    t('{n} to create', { n: item.create }), item.update ? t('{n} to update', { n: item.update }) : '', t('{n} skipped', { n: item.skip }), t('{n} with errors', { n: item.error }),
    item.possibleDuplicates ? t('{n, plural, one {# possible duplicate} other {# possible duplicates}}', { n: item.possibleDuplicates }) : '',
    item.newProjects ? t('{n, plural, one {# new project} other {# new projects}}', { n: item.newProjects }) : '', item.newLabels ? t('{n, plural, one {# new label} other {# new labels}}', { n: item.newLabels }) : '',
    item.newSections ? t('{n, plural, one {# new section} other {# new sections}}', { n: item.newSections }) : '', item.recurring ? t('{n} recurring', { n: item.recurring }) : '',
    item.reminders ? t('{n, plural, one {# reminder} other {# reminders}}', { n: item.reminders }) : '', item.deadlines ? t('{n} with deadlines', { n: item.deadlines }) : '',
  ].filter(Boolean)
  return <p className="text-body text-muted">{t('{n, plural, one {# row} other {# rows}}: {summary}', { n: item.rows, summary: parts.join(' · ') })}</p>
}

function jobSummary(j: ImportJob): string {
  const item = j.totals
  const base = j.status === 'running'
    ? `writing ${item.written}/${item.entities}`
    : `${item.create} created${item.update ? `, ${item.update} updated` : ''}, ${item.skip} skipped, ${item.error} errors`
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
    <PageBody width="list" className="space-y-6">
      <PageHeader title={t('Import data')} help="import" back={{ label: t('Data'), href: '/settings/data', onClick: () => navigate({ view: 'settings', section: 'data' }) }} />
      <section>
        <p className="text-body text-muted">
          {t('Bring in tasks from an OpenTodo export, a CSV file or another task manager\'s JSON export. You see a preview first; nothing is written until you confirm, and every import can be undone. Import runs on your server, so it needs a connection. Help explains the formats and options.')}
        </p>
      </section>

      {p.offline && (
        <p role="status" className="rounded-control border border-warning bg-warning-soft p-3 text-body text-on-warning-soft">
          {t('You are offline. Import needs a connection to your server; the file picker is disabled until you are back online.')}
        </p>
      )}

      <section className="space-y-3">
        <label className="block text-body font-medium" htmlFor="import-file">{t('File')}</label>
        <input id="import-file" type="file" accept=".json,.csv,.txt,application/json,text/csv" disabled={disabled}
          className="block w-full text-body file:mr-3 file:rounded-control file:border-0 file:bg-sunken file:px-3 file:py-1.5 file:text-body"
          onChange={(e) => p.onPickFile(e.target.files?.[0] ?? null)} />

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-body">
            <span className="mb-1 block text-muted">{t('Format')}</span>
            <select className="ui-input" value={p.format} disabled={disabled} onChange={(e) => p.onFormat(e.target.value as ImportFormat | '')}>
              <option value="">{t('Detect automatically')}{p.preview && !p.format ? ` (${FORMAT_LABELS[p.preview.format]})` : ''}</option>
              {IMPORT_FORMATS.map((f) => <option key={f} value={f}>{FORMAT_LABELS[f]}</option>)}
            </select>
          </label>
          <div className="text-body">
            <span className="mb-1 block text-muted" aria-hidden>{t('Tasks without a project go to')}</span>
            <ProjectPickerField label={t('Tasks without a project go to')} projects={p.projects} value={o.targetProject || null} disabled={disabled}
              onChange={(id) => p.onOption('targetProject', id ?? '')} rankContext="import.target" />
          </div>
          <label className="text-body">
            <span className="mb-1 block text-muted">{t('Time zone for date-times with a zone')}</span>
            <input className="ui-input" list="import-zones" value={o.timeZone} disabled={disabled} onChange={(e) => p.onOption('timeZone', e.target.value)} />
            <datalist id="import-zones">{p.zones.map((z) => <option key={z} value={z} />)}</datalist>
          </label>
          <label className="text-body">
            <span className="mb-1 block text-muted">{t('Sections')}</span>
            <select className="ui-input" value={o.sections} disabled={disabled} onChange={(e) => p.onOption('sections', e.target.value as 'section' | 'label' | 'ignore')}>
              <option value="section">{t('Keep as sections')}</option>
              <option value="label">{t('Turn into labels')}</option>
              <option value="ignore">{t('Ignore')}</option>
            </select>
          </label>
          <label className="text-body">
            <span className="mb-1 block text-muted">{t('Possible duplicates')}</span>
            <select className="ui-input" value={o.duplicates} disabled={disabled} onChange={(e) => p.onOption('duplicates', e.target.value as 'skip' | 'import')}>
              <option value="skip">{t('Skip them')}</option>
              <option value="import">{t('Import them anyway')}</option>
            </select>
          </label>
          <label className="text-body">
            <span className="mb-1 block text-muted">{t('Rows with errors')}</span>
            <select className="ui-input" value={o.errors} disabled={disabled} onChange={(e) => p.onOption('errors', e.target.value as 'skip_rows' | 'abort')}>
              <option value="skip_rows">{t('Skip those rows')}</option>
              <option value="abort">{t('Abort the whole import')}</option>
            </select>
          </label>
          {isOwn && (
            <label className="text-body">
              <span className="mb-1 block text-muted">{t('Items that already exist')}</span>
              <select className="ui-input" value={o.existing} disabled={disabled} onChange={(e) => p.onOption('existing', e.target.value as 'skip' | 'overwrite')}>
                <option value="skip">{t('Keep mine (skip)')}</option>
                <option value="overwrite">{t('Overwrite changed fields')}</option>
              </select>
            </label>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button className="ui-btn ui-btn--secondary ui-btn--md" disabled={disabled || !p.fileName} onClick={p.onPreview}>
            {p.preview ? t('Refresh preview') : t('Preview')}
          </button>
          <button className="ui-btn ui-btn--primary ui-btn--md" disabled={disabled || !p.preview || actionable === 0 || p.job?.status === 'running'} onClick={p.onStart}>
            {t('Import {actionable, plural, one {# item} other {# items}}', { actionable })}
          </button>
          {p.busy && <span className="text-meta text-faint">{t('Working…')}</span>}
        </div>
        {p.error && <p role="alert" className="text-body text-danger">{p.error}</p>}
      </section>

      {p.job && (
        <section aria-live="polite" className="rounded-control border border-default p-3 text-body">
          <p className="font-medium">
            {p.job.status === 'running' ? t('Importing…') : p.job.status === 'done' ? t('Import finished') : p.job.status === 'failed' ? t('Import failed') : t('Import undone')}
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
            {t('Preview · {format}', { format: FORMAT_LABELS[p.preview.format] })}{p.preview.version ? ` v${p.preview.version}` : ''}
          </h2>
          <Totals t={p.preview.totals} />
          {p.preview.template && (
            <p className="text-body text-muted" data-template-hint>
              {t('This file is a template. Importing it creates it once, with the ids and dates in the file. To start a fresh copy with dates moved to a start day, use')}{' '}
              <button type="button" className="text-accent underline" onClick={requestTemplateDialog}>{t('From a template…')}</button>
            </p>
          )}
          {p.preview.notes?.filter((n) => !(p.preview?.template && n.startsWith('This file is a template'))).map((n) => <p key={n} className="text-body text-warning">{n}</p>)}
          {p.preview.columns && (
            <p className="text-meta text-muted">
              {t('Columns used:')}{' '}{p.preview.columns.recognised.join(', ') || t('none')}
              {p.preview.columns.ignored.length > 0 && <>{' '}{t('· ignored: {columns}', { columns: p.preview.columns.ignored.join(', ') })}</>}
            </p>
          )}
          <div className="max-h-[50dvh] overflow-auto rounded-control border border-default" data-scroll-x>
            <table className="w-full text-left text-body">
              <thead className="sticky top-0 bg-canvas text-meta text-muted">
                <tr><th className="px-2 py-1">{t('Row')}</th><th className="px-2 py-1">{t('Title')}</th><th className="px-2 py-1">{t('Project')}</th><th className="px-2 py-1">{t('Outcome')}</th><th className="px-2 py-1">{t('Details')}</th></tr>
              </thead>
              <tbody>
                {p.preview.rows.slice(0, TABLE_LIMIT).map((r, i) => (
                  <tr key={`${r.sourceId ?? ''}-${i}`} className="border-t border-default align-top">
                    <td className="px-2 py-1 text-meta text-faint">{r.file ? `${r.file}:${r.row ?? ''}` : r.row ?? r.sourceId}</td>
                    <td className="px-2 py-1">{r.kind !== 'task' && <span className="mr-1 text-meta text-faint">{r.kind}</span>}{r.title || <em className="text-faint">{t('untitled')}</em>}</td>
                    <td className="px-2 py-1 text-muted">{r.project}</td>
                    <td className={`px-2 py-1 font-medium ${OUTCOME_STYLE[r.outcome]}`}>{r.outcome}</td>
                    <td className="px-2 py-1 text-meta text-muted">
                      {r.reason && <div className={r.outcome === 'error' ? 'text-danger' : ''}>{r.reason.replace(/_/g, ' ')}</div>}
                      {r.warnings?.map((w) => <div key={w} className="text-warning">{w}</div>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(p.preview.truncated || p.preview.rows.length > TABLE_LIMIT) && (
            <p className="text-meta text-faint">{t('Showing the first rows; rows with errors, skips and warnings are listed first. The totals count every row.')}</p>
          )}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-semibold">{t('Past imports')}</h2>
        {p.jobs === null && (p.offline ? <p className="text-body text-faint">{t('No imports loaded yet.')}</p> : <Skeleton shape="line" count={3} label={t('Loading past imports')} />)}
        {p.jobs && p.jobs.length === 0 && <p className="text-body text-faint">{t('No imports yet.')}</p>}
        <ul className="divide-y divide-(--ot-border)">
          {p.jobs?.map((j) => (
            <li key={j.id} className="flex items-center gap-3 py-2 text-body">
              <div className="min-w-0 flex-1">
                <p>
                  <span className="mr-2 rounded-control bg-sunken dark:bg-raised px-1.5 py-0.5 text-meta">{j.status}</span>
                  {dt.formatInstant(j.createdAt, 'datetime')}
                </p>
                <p className="truncate text-meta text-muted">{jobSummary(j)}{j.message ? ` · ${j.message}` : ''}</p>
              </div>
              {(j.status === 'done' || j.status === 'failed') && (
                <button className="ui-btn ui-btn--danger ui-btn--sm text-meta" disabled={disabled} onClick={() => p.onUndo(j)}>{t('Undo')}</button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </PageBody>
  )
}

/** Settings → Import: owns the state, talks to the server and polls the running job. */
export function ImportScreen() {
  const online = useOnline()
  const sync = useSyncStatus()
  const offline = !online || sync.state === 'offline'
  const live = useProjects()
  const projects = useMemo(() => visibleProjects(live).sort((a, b) => a.name.localeCompare(b.name)), [live])
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
    if (isNetworkError(err)) return t('The server could not be reached. Import needs a connection.')
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

  const [undoing, setUndoing] = useState<ImportJob | null>(null)
  async function undo(j: ImportJob) {
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

  const created = undoing ? undoing.totals.create + undoing.totals.newProjects + undoing.totals.newLabels : 0
  return (
    <>
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
      onUndo={setUndoing}
    />
    {undoing && (
      <ConfirmDialog title={t('Undo this import?')} confirmLabel={t('Undo import')}
        consequence={t('{n, plural, one {The # item it created will be deleted on every device. Items it updated are kept.} other {The # items it created will be deleted on every device. Items it updated are kept.}}', { n: created })}
        onConfirm={() => undo(undoing)} onCancel={() => setUndoing(null)} />
    )}
    </>
  )
}

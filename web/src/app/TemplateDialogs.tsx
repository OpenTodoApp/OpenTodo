// Project templates and duplication (OpenSpec change project-templates, design D6):
// Duplicate… and Save as template… from the project menu, From a template… from
// the sidebar, which opens on the template library (template-library). Everything happens on the device: a copy is one batch of ops, a
// template file is built from local data and downloaded.
import { useLiveQuery } from 'dexie-react-hooks'
import { lazy, Suspense, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { logicalToday } from '../lib/dates'
import { projectsAndLabels, useProjects } from '../lib/localData'
import { useEncryption } from '../lib/e2ee'
import { mutateMany } from '../lib/ops'
import {
  countTasks, downloadJSON, duplicateProject, fileFromTree, planTree, summarise, TemplateFileError, TemplateTooLargeError, templateFileName,
  treeFromFile, treeFromProject, type TemplateTree,
} from '../lib/templates'
import type { Project } from '../lib/types'
import { Button, Field, IconButton, Input, Notice, Dialog } from '../ui'
import { DateField } from './datetime/DateField'
import { HelpLink } from './help/HelpLink'
import { loadLibrary, startLibraryTemplate, type LibraryTemplate } from '../lib/templateLibrary'
// The library's views load with the dialog, like its data (template-library D5): the first screen does not carry them.
const LibraryList = lazy(() => import('./templates/TemplateLibrary').then((m) => ({ default: m.LibraryList })))
const LibraryDetail = lazy(() => import('./templates/TemplateLibrary').then((m) => ({ default: m.LibraryDetail })))
import { ProjectPickerField } from './ProjectPickerField'
import { navigate } from './router'
import { t } from '../lib/i18n'

// "From a template…" can be opened from elsewhere (the Import screen's hint).
let templateRequested = 0
const listeners = new Set<() => void>()
/** Ask the sidebar to open the From a template dialog. */
export function requestTemplateDialog(): void {
  templateRequested++
  listeners.forEach((fn) => fn())
}
/** How many times the dialog was asked for (tests). */
export const templateRequests = (): number => templateRequested
export function useTemplateRequests(): number {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn) }, () => templateRequested)
}

function errorText(err: unknown): string {
  if (err instanceof TemplateTooLargeError || err instanceof TemplateFileError) return err.message
  return err instanceof Error ? err.message : String(err)
}

function Summary({ tree }: { tree: TemplateTree }) {
  const s = summarise(tree)
  return (
    <p className="text-body text-muted" data-template-summary>
      {[
        t('{n, plural, one {# project} other {# projects}}', { n: s.projects }), t('{n, plural, one {# section} other {# sections}}', { n: s.sections }),
        t('{n, plural, one {# task} other {# tasks}}', { n: s.tasks }), t('{n, plural, one {# label} other {# labels}}', { n: s.labels }),
      ].join(', ')}
      {s.tasks > 0 && <>{t('; {n} dated', { n: s.dated })}{s.recurring ? t(', {n} repeating', { n: s.recurring }) : ''}</>}
    </p>
  )
}

/** Duplicate… : a personal copy, optionally under a parent and with dates moved to a start day. */
export function DuplicateProjectDialog({ project, shared, onClose }: { project: Project; shared: boolean; onClose: () => void }) {
  const projects = useProjects()
  const tree = useLiveQuery(() => treeFromProject(project.id), [project.id])
  const [name, setName] = useState(`${project.name} copy`)
  const [parentId, setParentId] = useState<string | null>(project.parent_id ?? null)
  const [startDay, setStartDay] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const count = tree ? countTasks(tree) : 0
  async function create() {
    setError(null)
    try {
      const id = await duplicateProject(project.id, { name, parentId, startDay })
      onClose()
      navigate({ view: 'project', id })
    } catch (err) {
      setError(errorText(err))
    }
  }
  return (
    <Dialog title={t('Duplicate “{name}”', { name: project.name })} onClose={onClose} testId="duplicate-project">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void create() }}>
        {shared && <Notice>{t('A personal copy of this project: nobody else sees it, and assignees are left out.')}</Notice>}
        <Field label={t('Name')}><Input value={name} autoFocus onChange={(e) => setName(e.target.value)} required /></Field>
        <div className="text-body">
          <span className="mb-1 block text-muted" aria-hidden>{t('Parent project')}</span>
          <ProjectPickerField label={t('Parent project')} projects={projects.filter((p) => p.id !== project.id)} value={parentId} inbox={false} noneLabel={t('Top level')}
            onChange={setParentId} rankContext="duplicate.parent" />
        </div>
        <div className="text-body">
          <span className="mb-1 block text-muted">{t.rich('Start on <span>(optional; dates move so the earliest lands on this day)</span>', { span: (chunks) => <span className="text-faint">{chunks}</span> })}</span>
          <DateField label={t('Start on')} hideLabel value={startDay} onChange={setStartDay} />
        </div>
        <p className="text-body text-muted" data-duplicate-count>{t('{n, plural, one {# open task and its subtasks are copied; completed work, comments and reminders are not.} other {# open tasks and their subtasks are copied; completed work, comments and reminders are not.}}', { n: count })}</p>
        {error && <p role="alert" className="text-body text-danger">{error}</p>}
        <div className="flex items-center justify-end gap-2">
          <HelpLink screen="templates" topic={t('Duplicate a project')} />
          <Button variant="ghost" onClick={onClose}>{t('Cancel')}</Button>
          <Button variant="primary" type="submit" disabled={!name.trim() || !tree}>{t('Duplicate')}</Button>
        </div>
      </form>
    </Dialog>
  )
}

/** Save as template… : a file in the own export format, built on this device. */
export function SaveTemplateDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const tree = useLiveQuery(() => treeFromProject(project.id), [project.id])
  const enc = useEncryption()
  const save = () => {
    if (!tree) return
    downloadJSON(fileFromTree(tree, { day: logicalToday() }), templateFileName(project.name))
    onClose()
  }
  return (
    <Dialog title={t('Save as template')} onClose={onClose} testId="save-template">
      <div className="space-y-3">
        <p className="text-body">{t('A file with “{name}”, its sections and open tasks, to start new projects from later or share.', { name: project.name })}</p>
        {tree && <Summary tree={tree} />}
        {enc.enabled && <Notice tone="warning">{t('The file is not encrypted: anyone who has it can read your task titles and notes.')}</Notice>}
        <div className="flex items-center justify-end gap-2">
          <HelpLink screen="templates" topic={t('Templates')} />
          <Button variant="ghost" onClick={onClose}>{t('Cancel')}</Button>
          <Button variant="primary" icon="download" onClick={save} disabled={!tree}>{t('Download')}</Button>
        </div>
      </div>
    </Dialog>
  )
}

type View = { kind: 'library' } | { kind: 'detail'; tpl: LibraryTemplate } | { kind: 'file' }

/**
 * From a template… (template-library "Start a project from a template"): opens on the
 * library of this release; Upload a file… keeps the file path. Escape steps back from the
 * detail and the file view to the library, and closes from the library.
 */
export function TemplateDialog({ onClose }: { onClose: () => void }) {
  const projects = useProjects()
  const [view, setView] = useState<View>({ kind: 'library' })
  const [library, setLibrary] = useState<LibraryTemplate[] | null>(null)
  const [query, setQuery] = useState('')
  const [startDay, setStartDay] = useState<string | null>(logicalToday())
  const [parentId, setParentId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let live = true
    loadLibrary().then((l) => { if (live) setLibrary(l.templates) }, (err: unknown) => { if (live) { setLibrary([]); setError(errorText(err)) } })
    return () => { live = false }
  }, [])
  const back = () => { setError(null); setView({ kind: 'library' }) }
  async function createFromLibrary(tpl: LibraryTemplate) {
    setBusy(true)
    setError(null)
    try {
      const plan = await startLibraryTemplate(tpl, { startDay, parentId })
      onClose()
      if (plan.projectIds[0]) navigate({ view: 'project', id: plan.projectIds[0] })
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }
  return (
    <Dialog title={t('From a template')} onClose={onClose} onEscape={view.kind === 'library' ? onClose : back} size="lg" testId="template-dialog">
      <Suspense fallback={<p className="text-body text-muted" role="status">{t('Loading templates…')}</p>}>
        {view.kind === 'library' && (
          library
            ? <LibraryList templates={library} query={query} onQuery={setQuery} onOpen={(tpl) => setView({ kind: 'detail', tpl })} onUpload={() => setView({ kind: 'file' })} />
            : <p className="text-body text-muted" role="status">{t('Loading templates…')}</p>
        )}
        {view.kind === 'detail' && (
          <LibraryDetail tpl={view.tpl} projects={projects} startDay={startDay} onStartDay={setStartDay} parentId={parentId} onParent={setParentId}
            busy={busy} onBack={back} onCreate={() => void createFromLibrary(view.tpl)} />
        )}
      </Suspense>
      {view.kind === 'file' && <TemplateFileForm projects={projects} onBack={back} onClose={onClose} />}
      {error && view.kind !== 'file' && <p role="alert" className="mt-3 text-body text-danger" data-template-error>{error}</p>}
      <div className="mt-3 flex justify-end"><HelpLink screen="templates" topic={t('Templates')} /></div>
    </Dialog>
  )
}

/** Upload a file…: a template file (the own export format), dates counted from a start day. */
function TemplateFileForm({ projects, onBack, onClose }: { projects: Project[]; onBack: () => void; onClose: () => void }) {
  const [tree, setTree] = useState<TemplateTree | null>(null)
  const [fileName, setFileName] = useState('')
  const [startDay, setStartDay] = useState<string | null>(logicalToday())
  const [parentId, setParentId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function read(file: File) {
    setError(null)
    setTree(null)
    setFileName(file.name)
    try {
      const text = await file.text()
      let doc: unknown
      try { doc = JSON.parse(text) } catch { throw new TemplateFileError(t('This is not an OpenTodo template.')) }
      const template = treeFromFile(doc)
      const total = countTasks(template)
      if (total > 1000) throw new TemplateTooLargeError(total)
      setTree(template)
    } catch (err) {
      const base = errorText(err)
      setError(err instanceof TemplateFileError ? `${base} ${t('CSV files and other apps’ exports go through Settings → Data → Import.')}` : base)
    }
  }
  async function create() {
    if (!tree) return
    setBusy(true)
    setError(null)
    try {
      const plan = planTree(tree, { ...(await projectsAndLabels()), parentId, startDay })
      await mutateMany(plan.changes)
      onClose()
      if (plan.projectIds[0]) navigate({ view: 'project', id: plan.projectIds[0] })
      else navigate({ view: 'inbox' })
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void create() }} data-template-file-form>
      <div className="flex items-center gap-2">
        <IconButton icon="chevron-left" size="sm" label={t('Back to the library')} onClick={onBack} data-template-back />
        <h3 className="text-h3 font-semibold text-strong">{t('Upload a file')}</h3>
      </div>
      <p className="text-body text-muted">{t('Pick a template file: one you saved, or a download from open-todo.app. It becomes a new project with fresh ids; nothing in the file is changed.')}</p>
      <label className="block text-body">
        <span className="mb-1 block text-muted">{t('Template file')}</span>
        <input type="file" accept=".json,application/json" className="block w-full text-body" data-testid="template-file"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void read(f) }} />
      </label>
      {tree && (
        <>
          <p className="text-body"><strong>{fileName}</strong></p>
          <Summary tree={tree} />
          <div className="text-body">
            <span className="mb-1 block text-muted">{t('Start on')}</span>
            <DateField label={t('Start on')} hideLabel value={startDay} onChange={setStartDay} />
          </div>
          <div className="text-body">
            <span className="mb-1 block text-muted" aria-hidden>{t('Parent project')}</span>
            <ProjectPickerField label={t('Parent project')} projects={projects} value={parentId} inbox={false} noneLabel={t('Top level')} onChange={setParentId} rankContext="template.parent" />
          </div>
        </>
      )}
      {error && <p role="alert" className="text-body text-danger" data-template-error>{error}</p>}
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="primary" type="submit" disabled={!tree} busy={busy}>{t('Create')}</Button>
      </div>
    </form>
  )
}

/** Opens the From a template dialog whenever requestTemplateDialog() is called. */
export function TemplateDialogHost() {
  const requests = useTemplateRequests()
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState(requests)
  useEffect(() => { if (requests !== seen) { setSeen(requests); setOpen(true) } }, [requests, seen])
  return useMemo(() => (open ? <TemplateDialog onClose={() => setOpen(false)} /> : null), [open])
}

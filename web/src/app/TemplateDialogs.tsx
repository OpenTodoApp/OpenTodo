// Project templates and duplication (OpenSpec change project-templates, design D6):
// Duplicate… and Save as template… from the project menu, From a template… from
// the sidebar. Everything happens on the device: a copy is one batch of ops, a
// template file is built from local data and downloaded.
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { todayISO } from '../lib/dates'
import { db } from '../lib/db'
import { useEncryption } from '../lib/e2ee'
import { mutateMany } from '../lib/ops'
import {
  countTasks, downloadJSON, duplicateProject, fileFromTree, planTree, summarise, TemplateFileError, TemplateTooLargeError, templateFileName,
  treeFromFile, treeFromProject, type TemplateTree,
} from '../lib/templates'
import type { Project } from '../lib/types'
import { Button } from '../ui/Button'
import { Field, Input } from '../ui/Field'
import { Notice } from '../ui/patterns/Notice'
import { DateField } from './datetime/DateField'
import { HelpLink } from './help/HelpLink'
import { Dialog } from './overlay/Dialog'
import { ProjectPickerField } from './ProjectPickerField'
import { navigate } from './router'

// "From a template…" can be opened from elsewhere (the Import screen's hint).
let templateRequested = 0
const listeners = new Set<() => void>()
/** Ask the sidebar to open the From a template dialog. */
export function requestTemplateDialog(): void {
  templateRequested++
  listeners.forEach((fn) => fn())
}
export function useTemplateRequests(): number {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn) }, () => templateRequested)
}

function errorText(err: unknown): string {
  if (err instanceof TemplateTooLargeError || err instanceof TemplateFileError) return err.message
  return err instanceof Error ? err.message : String(err)
}

function Summary({ tree }: { tree: TemplateTree }) {
  const s = summarise(tree)
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`
  return (
    <p className="text-sm text-muted" data-template-summary>
      {[n(s.projects, 'project', 'projects'), n(s.sections, 'section', 'sections'), n(s.tasks, 'task', 'tasks'), n(s.labels, 'label', 'labels')].join(', ')}
      {s.tasks > 0 && <>; {s.dated} dated{s.recurring ? `, ${s.recurring} repeating` : ''}</>}
    </p>
  )
}

/** Duplicate… : a personal copy, optionally under a parent and with dates moved to a start day. */
export function DuplicateProjectDialog({ project, shared, onClose }: { project: Project; shared: boolean; onClose: () => void }) {
  const projects = useLiveQuery(() => db.projects.filter((p) => !p.deleted_at).toArray(), [], [] as Project[])
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
    <Dialog title={`Duplicate “${project.name}”`} onClose={onClose} testId="duplicate-project">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void create() }}>
        {shared && <Notice>A personal copy of this project: nobody else sees it, and assignees are left out.</Notice>}
        <Field label="Name"><Input value={name} autoFocus onChange={(e) => setName(e.target.value)} required /></Field>
        <div className="text-sm">
          <span className="mb-1 block text-muted" aria-hidden>Parent project</span>
          <ProjectPickerField label="Parent project" projects={projects.filter((p) => p.id !== project.id)} value={parentId} inbox={false} noneLabel="Top level"
            onChange={setParentId} rankContext="duplicate.parent" />
        </div>
        <div className="text-sm">
          <span className="mb-1 block text-muted">Start on <span className="text-faint">(optional; dates move so the earliest lands on this day)</span></span>
          <DateField label="Start on" hideLabel value={startDay} onChange={setStartDay} />
        </div>
        <p className="text-sm text-muted" data-duplicate-count>{count === 1 ? '1 open task' : `${count} open tasks`} and their subtasks are copied; completed work, comments and reminders are not.</p>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex items-center justify-end gap-2">
          <HelpLink screen="templates" topic="Duplicate a project" />
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={!name.trim() || !tree}>Duplicate</Button>
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
    downloadJSON(fileFromTree(tree, { day: todayISO() }), templateFileName(project.name))
    onClose()
  }
  return (
    <Dialog title="Save as template" onClose={onClose} testId="save-template">
      <div className="space-y-3">
        <p className="text-sm">A file with “{project.name}”, its sections and open tasks, to start new projects from later or share.</p>
        {tree && <Summary tree={tree} />}
        {enc.enabled && <Notice tone="warning">The file is not encrypted: anyone who has it can read your task titles and notes.</Notice>}
        <div className="flex items-center justify-end gap-2">
          <HelpLink screen="templates" topic="Templates" />
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon="download" onClick={save} disabled={!tree}>Download</Button>
        </div>
      </div>
    </Dialog>
  )
}

/** From a template… : a fresh copy of a template file, dates counted from a start day. */
export function TemplateDialog({ onClose }: { onClose: () => void }) {
  const projects = useLiveQuery(() => db.projects.filter((p) => !p.deleted_at).toArray(), [], [] as Project[])
  const [tree, setTree] = useState<TemplateTree | null>(null)
  const [fileName, setFileName] = useState('')
  const [startDay, setStartDay] = useState<string | null>(todayISO())
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
      try { doc = JSON.parse(text) } catch { throw new TemplateFileError('This is not an OpenTodo template.') }
      const t = treeFromFile(doc)
      const total = countTasks(t)
      if (total > 1000) throw new TemplateTooLargeError(total)
      setTree(t)
    } catch (err) {
      const base = errorText(err)
      setError(err instanceof TemplateFileError ? `${base} CSV files and other apps' exports go through Settings → Data → Import.` : base)
    }
  }
  async function create() {
    if (!tree) return
    setBusy(true)
    setError(null)
    try {
      const plan = planTree(tree, { labels: await db.labels.toArray(), projects: await db.projects.toArray(), parentId, startDay })
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
    <Dialog title="From a template" onClose={onClose} testId="template-dialog">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void create() }}>
        <p className="text-sm text-muted">Pick a template file: one you saved, or a download from open-todo.app. It becomes a new project with fresh ids; nothing in the file is changed.</p>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Template file</span>
          <input type="file" accept=".json,application/json" className="block w-full text-sm" data-testid="template-file"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void read(f) }} />
        </label>
        {tree && (
          <>
            <p className="text-sm"><strong>{fileName}</strong></p>
            <Summary tree={tree} />
            <div className="text-sm">
              <span className="mb-1 block text-muted">Start on</span>
              <DateField label="Start on" hideLabel value={startDay} onChange={setStartDay} />
            </div>
            <div className="text-sm">
              <span className="mb-1 block text-muted" aria-hidden>Parent project</span>
              <ProjectPickerField label="Parent project" projects={projects} value={parentId} inbox={false} noneLabel="Top level" onChange={setParentId} rankContext="template.parent" />
            </div>
          </>
        )}
        {error && <p role="alert" className="text-sm text-danger" data-template-error>{error}</p>}
        <div className="flex items-center justify-end gap-2">
          <HelpLink screen="templates" topic="Templates" />
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={!tree} busy={busy}>Create</Button>
        </div>
      </form>
    </Dialog>
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

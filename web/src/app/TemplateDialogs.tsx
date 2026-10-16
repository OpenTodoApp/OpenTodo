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
import { Button, Field, Input, Notice } from '../ui'
import { DateField } from './datetime/DateField'
import { HelpLink } from './help/HelpLink'
import { Dialog } from './overlay/Dialog'
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
        <p className="text-body text-muted" data-duplicate-count>{count === 1 ? t('1 open task') : t('{count} open tasks', { count })}{' '}{t('and their subtasks are copied; completed work, comments and reminders are not.')}</p>
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
    downloadJSON(fileFromTree(tree, { day: todayISO() }), templateFileName(project.name))
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
    <Dialog title={t('From a template')} onClose={onClose} testId="template-dialog">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void create() }}>
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
          <HelpLink screen="templates" topic={t('Templates')} />
          <Button variant="ghost" onClick={onClose}>{t('Cancel')}</Button>
          <Button variant="primary" type="submit" disabled={!tree} busy={busy}>{t('Create')}</Button>
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

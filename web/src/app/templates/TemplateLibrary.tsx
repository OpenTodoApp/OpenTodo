// The template library inside "From a template…" (OpenSpec change template-library, design
// D8): a searchable list of the release's templates grouped by category, and a detail view
// with the description, the steps and a preview of what starting it creates. Nothing is
// written until Create. Keyboard: the search field has focus, arrows move between cards,
// Enter opens one, Escape steps back (handled by the dialog), Create has focus in the detail.
import { type KeyboardEvent, useEffect, useMemo, useRef } from 'react'
import { useLabels } from '../../lib/localData'
import { currentLanguage, t } from '../../lib/i18n'
import {
  byCategory, categoryName, labelPlan, type LibraryTask, type LibraryTemplate, offsetLabel, pick, searchLibrary,
} from '../../lib/templateLibrary'
import type { Project } from '../../lib/types'
import { Button, Icon, IconButton, Input, isIconName } from '../../ui'
import { DateField } from '../datetime/DateField'
import { Markdown } from '../Markdown'
import { ProjectPickerField } from '../ProjectPickerField'

const cards = (root: HTMLElement | null) => [...(root?.querySelectorAll<HTMLButtonElement>('[data-template-card]') ?? [])]

function TemplateIcon({ name, size = 'sm' }: { name: string; size?: 'sm' | 'md' }) {
  return isIconName(name) ? <Icon name={name} size={size} /> : <Icon name="folder" size={size} />
}

/** The library view: search, then the cards by category. */
export function LibraryList({ templates, query, onQuery, onOpen, onUpload }: {
  templates: LibraryTemplate[]
  query: string
  onQuery: (q: string) => void
  onOpen: (tpl: LibraryTemplate) => void
  onUpload: () => void
}) {
  const lang = currentLanguage()
  const list = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const found = useMemo(() => searchLibrary(templates, query, lang), [templates, query, lang])
  const groups = byCategory(found)
  useEffect(() => { search.current?.focus() }, [])

  // Arrows move between cards; Up from the first card returns to the search field.
  function onListKey(e: KeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const all = cards(list.current)
    const at = all.indexOf(document.activeElement as HTMLButtonElement)
    if (at < 0) return
    e.preventDefault()
    if (e.key === 'ArrowUp' && at === 0) search.current?.focus()
    else all[Math.max(0, Math.min(all.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus()
  }

  return (
    <div className="space-y-3" data-template-library>
      <div className="flex flex-wrap items-center gap-2">
        <Input ref={search} type="search" value={query} onChange={(e) => onQuery(e.target.value)} placeholder={t('Search templates…')} aria-label={t('Search templates')}
          className="min-w-0 flex-1" data-template-search
          onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); cards(list.current)[0]?.focus() } }} />
        <Button variant="secondary" size="sm" icon="upload" onClick={onUpload} data-template-upload>{t('Upload a file…')}</Button>
      </div>
      <p className="sr-only" aria-live="polite" data-template-count>{t('{n, plural, one {# template} other {# templates}}', { n: found.length })}</p>
      <div ref={list} className="space-y-4" onKeyDown={onListKey}>
        {groups.map((g) => (
          <section key={g.category} aria-labelledby={`template-cat-${g.category}`}>
            <h3 id={`template-cat-${g.category}`} className="mb-1 text-meta font-semibold uppercase tracking-wide text-muted">{categoryName(g.category)}</h3>
            <ul className="space-y-1">
              {g.templates.map((tpl) => {
                const title = pick(tpl.text.title, lang)
                const summary = pick(tpl.text.summary, lang)
                return (
                  <li key={tpl.slug}>
                    <button type="button" data-template-card={tpl.slug} onClick={() => onOpen(tpl)}
                      className="flex w-full items-start gap-3 rounded-control px-2 py-2 text-left hover:bg-sunken focus-visible:bg-sunken dark:hover:bg-raised dark:focus-visible:bg-raised">
                      <span className="mt-0.5 text-muted" aria-hidden><TemplateIcon name={tpl.icon} size="md" /></span>
                      <span className="min-w-0">
                        <span className="block text-body font-medium text-strong">{title}<span className="sr-only">: </span></span>
                        <span className="block text-meta text-muted">{summary}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
        {found.length === 0 && <p className="px-2 text-body text-muted" data-template-empty>{t('No template matches. Try another word, or upload a template file.')}</p>}
      </div>
    </div>
  )
}

function TaskLine({ task, lang }: { task: LibraryTask; lang: string }) {
  const subtasks = task.subtasks?.length ?? 0
  return (
    <li>
      {pick(task.title, lang)}
      {task.due && <span className="text-muted"> · {offsetLabel(task.due)}</span>}
      {subtasks > 0 && <span className="text-muted"> · {t('{n, plural, one {# subtask} other {# subtasks}}', { n: subtasks })}</span>}
    </li>
  )
}

/** What starting the template creates, before anything is written. */
function Preview({ tpl, lang }: { tpl: LibraryTemplate; lang: string }) {
  const labels = useLabels()
  const { added, reused } = labelPlan(tpl, lang, labels)
  const c = tpl.counts
  return (
    <div className="space-y-2" data-template-preview>
      <p className="text-body" data-template-summary>
        {[
          t('{n, plural, one {# project} other {# projects}}', { n: c.projects }), t('{n, plural, one {# section} other {# sections}}', { n: c.sections }),
          t('{n, plural, one {# task} other {# tasks}}', { n: c.tasks }), t('{n, plural, one {# label} other {# labels}}', { n: c.labels }),
        ].join(', ')}
        {c.labels > 0 && <span className="text-muted"> ({t('{added} new, {reused} already yours', { added: added.length, reused: reused.length })})</span>}
      </p>
      {tpl.projects.map((p, i) => (
        <div key={i} className="rounded-control border border-default p-2 text-meta">
          <p className="font-medium text-strong">{pick(p.name, lang)}</p>
          {p.tasks?.length ? <ul className="ml-4 list-disc">{p.tasks.map((tk, j) => <TaskLine key={j} task={tk} lang={lang} />)}</ul> : null}
          {(p.sections ?? []).map((s, j) => (
            <div key={j} className="mt-1">
              <p className="text-muted">{pick(s.name, lang)}</p>
              <ul className="ml-4 list-disc">{(s.tasks ?? []).map((tk, k) => <TaskLine key={k} task={tk} lang={lang} />)}</ul>
            </div>
          ))}
        </div>
      ))}
      {tpl.labels.length > 0 && (
        <p className="text-meta text-muted">{t('Labels: {names}', { names: tpl.labels.map((l) => pick(l.name, lang)).join(', ') })}</p>
      )}
    </div>
  )
}

/** The detail view: description, steps, preview, start day and parent, Create. */
export function LibraryDetail({ tpl, projects, startDay, onStartDay, parentId, onParent, busy, onBack, onCreate }: {
  tpl: LibraryTemplate
  projects: Project[]
  startDay: string | null
  onStartDay: (d: string | null) => void
  parentId: string | null
  onParent: (id: string | null) => void
  busy: boolean
  onBack: () => void
  onCreate: () => void
}) {
  const lang = currentLanguage()
  const create = useRef<HTMLButtonElement>(null)
  // Create has focus (Enter starts the template) without scrolling the dialog away from its top.
  useEffect(() => { create.current?.focus({ preventScroll: true }) }, [])
  const steps = (title: string, list: LibraryTemplate['text']['howToUse']) => (
    <div>
      <h4 className="text-body font-semibold">{title}</h4>
      <ol className="ml-5 list-decimal text-body">{list.map((s, i) => <li key={i}>{pick(s, lang)}</li>)}</ol>
    </div>
  )
  return (
    <form className="space-y-3" data-template-detail={tpl.slug} onSubmit={(e) => { e.preventDefault(); onCreate() }}>
      <div className="flex items-center gap-2">
        <IconButton icon="chevron-left" size="sm" label={t('Back to the library')} onClick={onBack} data-template-back />
        <span className="text-muted" aria-hidden><TemplateIcon name={tpl.icon} size="md" /></span>
        <h3 className="min-w-0 flex-1 text-h3 font-semibold text-strong">{pick(tpl.text.title, lang)}</h3>
      </div>
      <Markdown source={pick(tpl.text.description, lang)} className="text-body" />
      <div className="grid gap-3 sm:grid-cols-2">
        {steps(t('How to use it'), tpl.text.howToUse)}
        {steps(t('Make it yours'), tpl.text.makeItYours)}
      </div>
      <Preview tpl={tpl} lang={lang} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="text-body">
          <span className="mb-1 block text-muted">{t('Start on')}</span>
          <DateField label={t('Start on')} hideLabel value={startDay} onChange={onStartDay} />
        </div>
        <div className="text-body">
          <span className="mb-1 block text-muted" aria-hidden>{t('Parent project')}</span>
          <ProjectPickerField label={t('Parent project')} projects={projects} value={parentId} inbox={false} noneLabel={t('Top level')} onChange={onParent} rankContext="template.parent" />
        </div>
      </div>
      {/* The action row stays in view while the description and preview scroll. */}
      <div className="sticky bottom-0 -mx-4 flex justify-end border-t border-default bg-surface px-4 py-2">
        <Button ref={create} variant="primary" type="submit" busy={busy} data-template-create>{t('Create')}</Button>
      </div>
    </form>
  )
}

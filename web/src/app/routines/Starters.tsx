// Routine starters in the app (OpenSpec change routines-starters, design D5): the
// starters list (cards by category, a search in the user's language and English)
// on /routines/starters and under the Routines page's empty state, and a
// starter's page on /routines/starters/<slug> with its description, its steps as
// sentences, what it needs, and its choices as words with an anchored list
// ("Create Groceries" first when no such project exists). Use this starter hands
// the filled routine to the editor, unsaved. No centred modal (DECISIONS.md,
// "Routines UX"). Keyboard: the search has focus, Down moves into the cards,
// arrows move between them, Up from the first returns to the search, Enter opens
// one, Escape steps back.
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import { messageOf } from '../../lib/errorText'
import { currentLanguage, msg, t, translatedMap } from '../../lib/i18n'
import { createLabel, LabelExistsError } from '../../lib/labels'
import { createProject } from '../../lib/ops'
import { isAvailable, reasonText, useCatalogue } from '../../lib/rules/catalogue'
import { draftTypes } from '../../lib/rules/draft'
import { outputNames, stepName } from '../../lib/rules/sentence'
import { loadStarters, missingChoices, pick, searchStarters, starterDraft, starterNeeds, type Starter, type StarterChoice } from '../../lib/rules/starters'
import { conditionParts, triggerText } from '../../lib/rules/summary'
import type { Label, Project, RoutineStep } from '../../lib/types'
import type { TemplateCategory } from '../../lib/templateLibrary'
import { Button, Icon, Input, isIconName, PageBody, PageHeader, Skeleton, WordButton } from '../../ui'
import { Markdown } from '../Markdown'
import { navigate } from '../router'
import { useShortcutScope } from '../shortcuts'
import { useRoutineNames, valueNamer, type RoutineNames } from './data'
import { ChoicePopover, type Choice } from './pickers'
import { openStarterDraft } from './routineNav'
import { sentenceText } from './StepCard'

const CATEGORY_ORDER: readonly TemplateCategory[] = ['personal', 'home', 'work', 'study', 'method']
const CATEGORY = translatedMap<string>({ personal: msg('Personal'), home: msg('Home'), work: msg('Work'), study: msg('Study'), method: msg('Method') })

/** The starters of this release, loaded once (null while loading). */
export function useStarters(): Starter[] | null {
  const [list, setList] = useState<Starter[] | null>(null)
  useEffect(() => {
    let live = true
    loadStarters().then((l) => { if (live) setList(l.starters) }, () => { if (live) setList([]) })
    return () => { live = false }
  }, [])
  return list
}

const cards = (root: HTMLElement | null) => [...(root?.querySelectorAll<HTMLButtonElement>('[data-starter-card]') ?? [])]

const openStarter = (slug: string) => navigate({ view: 'rules', starters: true, starter: slug })

/** The starters as cards by category, with a search. */
export function StarterList({ starters, autoFocus = false }: { starters: Starter[]; autoFocus?: boolean }) {
  const lang = currentLanguage()
  const [query, setQuery] = useState('')
  const list = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const found = useMemo(() => searchStarters(starters, query, lang), [starters, query, lang])
  useEffect(() => { if (autoFocus) search.current?.focus() }, [autoFocus])
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
    <div className="space-y-3" data-starter-list>
      <Input ref={search} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Search starters…')} aria-label={t('Search starters')}
        data-starter-search onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); cards(list.current)[0]?.focus() } }} />
      <p className="sr-only" aria-live="polite">{t('{n, plural, one {# starter} other {# starters}}', { n: found.length })}</p>
      <div ref={list} className="space-y-4" onKeyDown={onListKey}>
        {CATEGORY_ORDER.map((c) => {
          const items = found.filter((s) => s.category === c)
          if (!items.length) return null
          return (
            <section key={c} aria-labelledby={`starter-cat-${c}`}>
              <h3 id={`starter-cat-${c}`} className="mb-1 text-meta font-semibold uppercase tracking-wide text-muted">{CATEGORY[c]}</h3>
              <ul className="space-y-1">
                {items.map((s) => (
                  <li key={s.slug}>
                    <button type="button" data-starter-card={s.slug} onClick={() => openStarter(s.slug)}
                      className="flex w-full items-start gap-3 rounded-control px-2 py-2 text-left hover:bg-sunken focus-visible:bg-sunken dark:hover:bg-raised dark:focus-visible:bg-raised">
                      <span className="mt-0.5 text-muted" aria-hidden><Icon name={isIconName(s.icon) ? s.icon : 'zap'} size="md" /></span>
                      <span className="min-w-0">
                        <span className="block text-body font-medium text-strong">{pick(s.text.title, lang)}<span className="sr-only">: </span></span>
                        <span className="block text-meta text-muted">{pick(s.text.summary, lang)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
        {found.length === 0 && <p className="px-2 text-body text-muted" data-starter-empty>{t('No starter matches. Try another word, or start an empty routine.')}</p>}
      </div>
    </div>
  )
}

/** The starters list under the Routines page's empty state. */
export function StarterGallery() {
  const starters = useStarters()
  if (!starters) return <Skeleton shape="line" count={3} label={t('Loading the starters')} />
  return (
    <section className="space-y-2" aria-labelledby="starter-gallery" data-starter-gallery>
      <h2 id="starter-gallery" className="text-body font-semibold text-strong">{t('Start from a starter')}</h2>
      <StarterList starters={starters} />
    </section>
  )
}

/** /routines/starters and /routines/starters/<slug>. */
export function StartersPage({ slug }: { slug?: string }) {
  const starters = useStarters()
  const starter = slug ? starters?.find((s) => s.slug === slug) : undefined
  const back = () => navigate(slug ? { view: 'rules', starters: true } : { view: 'rules' })
  useShortcutScope('view', {
    'routines.escape': (e) => {
      if ((e.target as HTMLElement | null)?.closest?.('[data-overlay], [data-overlay-root]')) return false
      back()
    },
  }, { view: 'rules' })
  if (!starters) {
    return <PageBody width="list"><div className="py-6"><Skeleton shape="line" count={4} label={t('Loading the starters')} /></div></PageBody>
  }
  if (slug && !starter) {
    return (
      <PageBody width="list">
        <p className="py-6 text-body text-muted" data-starter-missing>
          {t('This starter is not in this version.')}{' '}
          <button type="button" className="underline" onClick={() => navigate({ view: 'rules', starters: true })}>{t('All starters')}</button>
        </p>
      </PageBody>
    )
  }
  if (starter) return <StarterDetail key={starter.slug} starter={starter} onBack={back} />
  return (
    <PageBody width="list" data-starters-page>
      <PageHeader title={t('Starters')} help="routines" back={{ label: t('Routines'), href: '/routines', onClick: back }} />
      <p className="mb-3 text-body text-muted">{t('Ready-made routines to start from. Choose one, make its choices, then edit it like any routine.')}</p>
      <StarterList starters={starters} autoFocus />
    </PageBody>
  )
}

/** The id of an existing project or label with the suggested name, or ''. */
function existingId(choice: StarterChoice, names: RoutineNames, lang: string): string {
  const name = pick(choice.suggest, lang).trim().toLocaleLowerCase()
  const list: readonly (Project | Label)[] = choice.type === 'project' ? names.projects.filter((p) => !p.archived && !p.deleted_at) : names.labels.filter((l) => !l.deleted_at)
  return list.find((x) => x.name.trim().toLocaleLowerCase() === name)?.id ?? ''
}

/** Names that also read an unchosen choice by its suggestion, for the sentences. */
function previewNames(s: Starter, values: Record<string, string>, names: RoutineNames, lang: string): { names: RoutineNames; values: Record<string, string> } {
  const projects = [...names.projects]
  const labels = [...names.labels]
  const filled = { ...values }
  for (const [name, c] of Object.entries(s.ask)) {
    if (filled[name]) continue
    filled[name] = `ask:${name}`
    const entry = { id: filled[name], name: pick(c.suggest, lang) }
    if (c.type === 'project') projects.push(entry as Project)
    else labels.push(entry as Label)
  }
  return { names: { ...names, projects, labels, projectName: (id) => projects.find((p) => p.id === id)?.name ?? names.projectName(id) }, values: filled }
}

function StepLines({ steps, ctx, depth = 0 }: { steps: RoutineStep[]; ctx: Parameters<typeof sentenceText>[1]; depth?: number }) {
  return (
    <>
      {steps.map((st) => (
        <li key={st.id} style={{ marginInlineStart: `${depth * 1.25}rem` }} data-starter-step={st.kind}>
          {sentenceText(st, ctx)}
          {(['then', 'otherwise', 'do'] as const).map((b) => st[b]?.length ? <ol key={b} className="mt-1 space-y-1"><StepLines steps={st[b]!} ctx={ctx} depth={depth + 1} /></ol> : null)}
        </li>
      ))}
    </>
  )
}

/** One choice: a word with its anchored list; the suggested name to create first when none exists. */
function ChoiceRow({ name, choice, value, names, lang, used, onChange }: {
  name: string; choice: StarterChoice; value: string; names: RoutineNames; lang: string; used: string; onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const anchor = useRef<HTMLButtonElement>(null)
  const suggest = pick(choice.suggest, lang)
  const project = choice.type === 'project'
  const items: readonly (Project | Label)[] = project ? names.projects.filter((p) => !p.archived && !p.deleted_at) : names.labels.filter((l) => !l.deleted_at)
  const current = items.find((x) => x.id === value)?.name ?? ''
  const create = async () => {
    setError('')
    try {
      onChange(project ? await createProject({ name: suggest }) : await createLabel({ name: suggest }))
    } catch (e) {
      if (e instanceof LabelExistsError) onChange(e.existing.id)
      else setError(messageOf(e))
    }
  }
  const choices: Choice[] = [
    ...(existingId(choice, names, lang) ? [] : [{ key: 'create', label: t('Create “{name}”', { name: suggest }), group: t('New'), run: () => void create() }]),
    ...items.map((x) => ({ key: x.id, label: x.name, group: project ? t('Projects') : t('Labels'), selected: x.id === value, run: () => onChange(x.id) })),
  ]
  const label = project ? t('Project') : t('Label')
  return (
    <li className="space-y-0.5" data-starter-choice={name}>
      <p className="text-body text-default">
        {label}:
        <WordButton ref={anchor} label={label} value={current} placeholder={project ? t('choose a project') : t('choose a label')} action={t('change')}
          haspopup="listbox" expanded={open} onClick={() => setOpen(true)} />
      </p>
      <p className="text-meta text-muted">{used}</p>
      {error && <p role="alert" className="text-meta text-danger">{error}</p>}
      <ChoicePopover open={open} onClose={() => { setOpen(false); requestAnimationFrame(() => anchor.current?.focus()) }} anchor={anchor} label={label} choices={choices} />
    </li>
  )
}

/** A starter's page: description, steps, needs, choices, Use this starter. */
function StarterDetail({ starter: s, onBack }: { starter: Starter; onBack: () => void }) {
  const lang = currentLanguage()
  const names = useRoutineNames()
  const catalogue = useCatalogue()
  const [values, setValues] = useState<Record<string, string>>({})
  // A project or label with the suggested name is chosen already (once the local data is read).
  useEffect(() => {
    setValues((v) => {
      const next = { ...v }
      for (const [name, c] of Object.entries(s.ask)) if (!next[name]) next[name] = existingId(c, names, lang)
      return Object.keys(next).every((k) => next[k] === (v[k] ?? '')) ? v : next
    })
  }, [s, names, lang])
  const preview = previewNames(s, values, names, lang)
  const draft = starterDraft(s, preview.values, lang)
  const types = draftTypes(draft)
  const ctx = { draft, types, outputs: outputNames(draft.steps, valueNamer(preview.names), types), names: preview.names }
  const when = triggerText(draft.trigger, preview.names)
  const cond = conditionParts(draft.condition, preview.names).join(', ')
  const missing = missingChoices(s, values)
  const needs = starterNeeds(s)
  // Where a choice is used: the first sentence that holds it.
  const usedIn = (name: string): string => {
    const holds = (v: unknown): boolean => JSON.stringify(v ?? null).includes(`"ask":"${name}"`)
    if (holds(s.trigger) || holds(s.condition)) return `${t('When')}: ${when}`
    let found = ''
    const walk = (list: RoutineStep[], drafted: RoutineStep[]) => list.forEach((st, i) => {
      if (!found && holds(st.in)) found = sentenceText(drafted[i], ctx)
      for (const b of ['then', 'otherwise', 'do'] as const) if (st[b]) walk(st[b]!, drafted[i][b] ?? [])
    })
    walk(s.steps, draft.steps)
    return found
  }
  const use = () => { if (!missing.length) openStarterDraft(starterDraft(s, values, lang)) }
  return (
    <PageBody width="list" data-starter-page={s.slug}>
      <PageHeader title={pick(s.text.title, lang)} help="routines" back={{ label: t('Starters'), href: '/routines/starters', onClick: onBack }}
        actions={<Button variant="primary" size="sm" onClick={use} disabled={missing.length > 0} data-starter-use>
          {missing.length ? t('{n, plural, one {Fill # choice first} other {Fill # choices first}}', { n: missing.length }) : t('Use this starter')}</Button>} />
      <div className="space-y-5 pb-8">
        <Markdown source={pick(s.text.description, lang)} className="text-body" />
        <section aria-labelledby="starter-steps" className="space-y-1">
          <h2 id="starter-steps" className="text-body font-semibold text-strong">{t('What it does')}</h2>
          <p className="text-body text-default" data-starter-when>{when.charAt(0).toLocaleUpperCase() + when.slice(1)}{cond ? ` · ${cond}` : ''}</p>
          <ol className="ml-5 list-decimal space-y-1 text-body text-default"><StepLines steps={draft.steps} ctx={ctx} /></ol>
        </section>
        {needs.length > 0 && (
          <section aria-labelledby="starter-needs" className="space-y-1" data-starter-needs>
            <h2 id="starter-needs" className="text-body font-semibold text-strong">{t('Needs')}</h2>
            <ul className="space-y-0.5 text-body">
              {needs.map((k) => {
                const ok = isAvailable(catalogue, k)
                return (
                  <li key={k} className={ok ? 'text-default' : 'text-warning'} data-starter-need={k} data-available={ok}>
                    {ok ? t('{step}: available', { step: stepName(k) }) : t('{step}: not available, {reason}', { step: stepName(k), reason: reasonText(catalogue?.[k]?.reason) })}
                  </li>
                )
              })}
            </ul>
          </section>
        )}
        {Object.keys(s.ask).length > 0 && (
          <section aria-labelledby="starter-choices" className="space-y-2" data-starter-choices>
            <h2 id="starter-choices" className="text-body font-semibold text-strong">{t('Your choices')}</h2>
            <ul className="space-y-3">
              {Object.entries(s.ask).map(([name, c]) => (
                <ChoiceRow key={name} name={name} choice={c} value={values[name] ?? ''} names={names} lang={lang} used={usedIn(name)}
                  onChange={(id) => setValues((v) => ({ ...v, [name]: id }))} />
              ))}
            </ul>
          </section>
        )}
        <p className="text-meta text-muted">{t('Nothing is saved until you save the routine in the editor.')}</p>
      </div>
    </PageBody>
  )
}

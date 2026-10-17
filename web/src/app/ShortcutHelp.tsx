// The cheat sheet (OpenSpec change ux-overhaul, keyboard-shortcuts "Cheat sheet"):
// rendered from the shortcut registry; the shortcuts of the scopes active right now
// come first, then "Everywhere" and "Go to", then the other sections, in two
// columns from 768 px, with a search field, inside a dialog capped at 80 % of the
// viewport with its own scroller.
import { Dialog } from '../ui'
import { useMemo, useState } from 'react'
import { displayKeys, listedShortcuts, QUICK_ADD_SYNTAX, SHORTCUT_SECTIONS, type Shortcut, type ShortcutSection } from '../lib/shortcuts'
import { navigate } from './router'
import { t } from '../lib/i18n'

/** An extra block of the sheet that is not made of keys (the Vim command line). */
export interface HelpSection {
  title: string
  note?: string
  rows: [string, string][]
  /** The first column is code (commands), not keys. */
  mono?: boolean
}

/** Where the user is when the sheet opens; decides which groups come first. */
export interface HelpContext {
  view?: string
  board?: boolean
  panelOpen?: boolean
}

/** The sections that apply in a context, most specific first. */
export function contextSections(ctx: HelpContext | undefined): ShortcutSection[] {
  if (!ctx) return []
  const out: ShortcutSection[] = []
  const v = ctx.view ?? ''
  if (ctx.panelOpen) out.push('comments')
  if (ctx.board) out.push('board')
  if (['inbox', 'today', 'upcoming', 'someday', 'anytime', 'completed', 'assigned', 'project', 'label'].includes(v)) out.push('tasks')
  if (v === 'day' || v === 'week' || v === 'month') out.push('calendar')
  if (v === 'triage') out.push('triage')
  if (v === 'filter' || v === 'view' || v === 'views') out.push('filter')
  if (v === 'trash' || v === 'feed') out.push('trash')
  if (v === 'settings' || v === 'import') out.push('settings')
  return out
}

/** Group order for a context: its own sections, Everywhere, Go to, then the rest. */
export function orderedSections(ctx: HelpContext | undefined): { id: ShortcutSection; title: string }[] {
  const first = [...contextSections(ctx), 'everywhere', 'go'] as ShortcutSection[]
  const seen = new Set<ShortcutSection>()
  const out: { id: ShortcutSection; title: string }[] = []
  for (const id of [...first, ...SHORTCUT_SECTIONS.map((s) => s.id)]) {
    if (seen.has(id)) continue
    seen.add(id)
    const sec = SHORTCUT_SECTIONS.find((s) => s.id === id)
    // The registry keeps English source text (the keyboard guide is generated from it); shown translated.
    if (sec) out.push({ id: sec.id, title: t(sec.title) })
  }
  return out
}

function matches(q: string, keys: string, description: string): boolean {
  if (!q) return true
  const hay = `${keys} ${description}`.toLowerCase()
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w))
}

function Rows({ rows, mono = false }: { rows: [string, string][]; mono?: boolean }) {
  return (
    <table className="w-full table-fixed text-body">
      <tbody>
        {rows.map(([k, d], i) => (
          <tr key={`${i}-${k}`} className="border-t border-default">
            <td className="w-2/5 py-1.5 pr-3 align-top">{mono ? <code className="break-words text-meta">{k}</code> : <span className="ui-kbd inline-block break-words">{k}</span>}</td>
            <td className="py-1.5 text-muted">{d}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** The sheet's rows for a registry entry: the keys as shown and the description, in the interface language. */
export function sheetRow(s: Shortcut): [string, string] {
  return [s.when ? displayKeys({ keys: s.keys, when: t(s.when) }) : displayKeys(s), t(s.description)]
}

export function ShortcutHelp({ onClose, extraSections = [], context, vim = extraSections.length > 0 }: {
  onClose: () => void
  extraSections?: HelpSection[]
  context?: HelpContext
  /** Whether the Vim layer is on: its rows are listed and its command-line block added. */
  vim?: boolean
}) {
  const [query, setQuery] = useState('')
  const q = query.trim()
  const groups = useMemo(() => {
    const bySection = new Map<ShortcutSection, Shortcut[]>()
    for (const s of listedShortcuts(vim)) bySection.set(s.section, [...(bySection.get(s.section) ?? []), s])
    return orderedSections(context)
      .map((sec) => ({ ...sec, rows: (bySection.get(sec.id) ?? []).map(sheetRow).filter(([k, d]) => matches(q, k, d)) }))
      .filter((g) => g.rows.length > 0)
  }, [context, q, vim])
  const extras = extraSections.map((sec) => ({ ...sec, rows: sec.rows.filter(([k, d]) => matches(q, k, d)) })).filter((s) => s.rows.length > 0)
  const quickAdd = QUICK_ADD_SYNTAX.map(([k, d]): [string, string] => [k, t(d)]).filter(([k, d]) => matches(q, k, d))
  const contextCount = contextSections(context).length
  const empty = groups.length === 0 && extras.length === 0 && quickAdd.length === 0

  return (
    // The shared Dialog: full screen on phones, a card from 640 px up with the
    // header pinned; from 640 px the sheet itself is capped and scrolls inside.
    <Dialog title={t('Keyboard shortcuts')} onClose={onClose} size="lg" className="!pt-2" testId="shortcut-help">
      <div role="search" className="mb-2">
        <label className="sr-only" htmlFor="shortcut-search">{t('Search shortcuts')}</label>
        <input id="shortcut-search" type="search" className="ui-input w-full" placeholder={t('Search by key or action')} value={query} autoFocus
          onChange={(e) => setQuery(e.target.value)} data-shortcut-search />
      </div>
      <p className="sr-only" aria-live="polite">{q ? t('{n, plural, one {# shortcut} other {# shortcuts}}', { n: groups.reduce((n, g) => n + g.rows.length, 0) + extras.reduce((n, s) => n + s.rows.length, 0) + quickAdd.length }) : ''}</p>
      <div className="sm:max-h-[calc(80dvh-9rem)] sm:overflow-y-auto sm:overscroll-contain" data-shortcut-sheet tabIndex={0} role="region" aria-label={t('Shortcuts')}>
        {empty && <p className="py-6 text-center text-body text-muted">{t('No shortcut matches “{q}”.', { q })}</p>}
        <div className="grid gap-x-6 md:grid-cols-2">
          {groups.map((g, i) => (
            <section key={g.id} data-help-section={g.title} data-context-section={i < contextCount && !q ? '' : undefined} className="mb-2 break-inside-avoid">
              <h3 className="mb-1 mt-3 text-body font-semibold">{g.title}{i < contextCount && !q ? <span className="ml-2 text-meta font-normal text-faint">{t('here')}</span> : null}</h3>
              <Rows rows={g.rows} />
            </section>
          ))}
          {extras.map((sec) => (
            <section key={sec.title} data-help-section={sec.title} className="mb-2">
              <h3 className="mb-1 mt-3 text-body font-semibold">{sec.title}</h3>
              {sec.note && <p className="mb-2 text-meta text-muted">{sec.note}</p>}
              <Rows rows={sec.rows} mono={sec.mono} />
            </section>
          ))}
          {quickAdd.length > 0 && (
            <section data-help-section="Quick add syntax" className="mb-2">
              <h3 className="mb-1 mt-3 text-body font-semibold">{t('Quick add syntax')}</h3>
              <Rows rows={quickAdd} mono />
            </section>
          )}
        </div>
      </div>
      {!vim && (
        <p className="mt-3 text-meta text-muted" data-vim-hint>{t('Prefer modal editing? Vim keybindings can be enabled in Settings → General → Keyboard.')}</p>
      )}
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-meta">
        <a className="touch-target inline-flex items-center text-muted underline" href="/help/quick-add"
          onClick={(e) => { e.preventDefault(); onClose(); navigate({ view: 'help', page: 'quick-add' }) }}>{t('Full quick add syntax')}</a>
        <a className="touch-target inline-flex items-center text-muted underline" href="/help/keyboard"
          onClick={(e) => { e.preventDefault(); onClose(); navigate({ view: 'help', page: 'keyboard' }) }}>{t('Keyboard guide')}</a>
        <a className="touch-target inline-flex items-center text-muted underline" href="/help"
          onClick={(e) => { e.preventDefault(); onClose(); navigate({ view: 'help' }) }}>{t.rich('Open Help ({keys})', { keys: <><span className="ui-kbd mx-0.5">g</span> <span className="ui-kbd mx-0.5">?</span></> })}</a>
      </p>
    </Dialog>
  )
}

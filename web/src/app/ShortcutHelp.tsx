// The cheat sheet (OpenSpec change ux-overhaul, keyboard-shortcuts "Cheat sheet"):
// rendered from the shortcut registry; the shortcuts of the scopes active right now
// come first, then "Everywhere" and "Go to", then the other sections, in two
// columns from 768 px (three from 1280 px), with a search field, inside a dialog capped
// at 80 % of the viewport with its own scroller. Rows are compact (shortcut-spotlight
// D6): the label on one line, the keys as keycaps that never wrap.
import { Dialog, Tooltip } from '../ui'
import { useMemo, useState } from 'react'
import { listedShortcuts, QUICK_ADD_SYNTAX, SHORTCUT_SECTIONS, type Shortcut, type ShortcutSection } from '../lib/shortcuts'
import { Keys } from './shortcuts/Kbd'
import { shortcutLabel } from './shortcuts/Spotlight'
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
  if (['inbox', 'today', 'upcoming', 'someday', 'anytime', 'completed', 'assigned', 'project', 'label', 'next', 'waiting'].includes(v)) out.push('tasks')
  if (v === 'day' || v === 'week' || v === 'month' || v === 'plan') out.push('calendar')
  if (v === 'triage') out.push('triage')
  if (v === 'focus') out.push('focus')
  if (v === 'review') out.push('tasks', 'review')
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

function matches(q: string, ...texts: string[]): boolean {
  if (!q) return true
  const hay = texts.join(' ').toLowerCase()
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w))
}

/** One row of the sheet: what it does, and its keys (or a command for the code blocks). */
export interface SheetRow {
  keys: string[]
  /** The short label, or the description when the entry has none. */
  label: string
  /** The full description (the row's accessible text and tooltip). */
  description: string
  /** The state the shortcut needs, shown under the label. */
  when?: string
}

/**
 * The head of a description for a one-line row: the text before its first colon,
 * semicolon or parenthesis ("Search and commands: find any task…" → "Search and
 * commands"), when that head is long enough to stand alone.
 */
export function shortDescription(text: string): string {
  const cut = text.search(/: |; | \(| — /)
  return cut >= 8 ? text.slice(0, cut) : text
}

/**
 * Heads shared by several rows of one group ("In the Trash: select…", "In the Trash:
 * restore…") say nothing on their own: those rows read the text after the head instead.
 */
export function distinctLabels(rows: SheetRow[]): SheetRow[] {
  const count = new Map<string, number>()
  for (const r of rows) count.set(r.label, (count.get(r.label) ?? 0) + 1)
  return rows.map((r) => {
    if ((count.get(r.label) ?? 0) < 2 || !r.description.startsWith(`${r.label}: `)) return r
    const tail = r.description.slice(r.label.length + 2)
    return { ...r, label: shortDescription(tail.charAt(0).toUpperCase() + tail.slice(1)) }
  })
}

/** The sheet's row for a registry entry, in the interface language. */
export function sheetRow(s: Shortcut): SheetRow {
  const description = t(s.description)
  return { keys: s.keys, label: s.label ? shortcutLabel(s) : shortDescription(description), description, when: s.when ? t(s.when) : undefined }
}

// Compact rows (shortcut-spotlight D6): the label on one line on the left, the keys as
// keycaps on the right. The key group never shrinks below its keycaps and the label
// truncates, so nothing can run into anything else.
function Rows({ rows, mono = false }: { rows: SheetRow[]; mono?: boolean }) {
  return (
    <ul className="divide-y divide-default">
      {rows.map((r, i) => (
        <li key={`${i}-${r.keys.join()}`} className="flex min-h-8 items-center justify-between gap-3 py-1" data-sheet-row>
          <span className="min-w-0 flex-1">
            {/* The full description is what assistive technology reads and the tooltip shows; the short label is what the eye scans. */}
            {r.label === r.description
              ? <span className="block truncate text-body text-default">{r.label}</span>
              : <><Tooltip label={r.description}><span aria-hidden className="block truncate text-body text-default">{r.label}</span></Tooltip><span className="sr-only">{r.description}</span></>}
            {r.when && <span className="block truncate text-hint text-faint" data-sheet-when>{r.when}</span>}
          </span>
          {mono
            ? <code className="max-w-[55%] shrink-0 break-words text-right text-meta text-muted">{r.keys.join(' ')}</code>
            : <Keys keys={r.keys} className="max-w-[60%] shrink-0" />}
        </li>
      ))}
    </ul>
  )
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
      .map((sec) => ({ ...sec, rows: distinctLabels((bySection.get(sec.id) ?? []).map(sheetRow)).filter((r) => matches(q, r.keys.join(' '), r.label, r.description, r.when ?? '')) }))
      .filter((g) => g.rows.length > 0)
  }, [context, q, vim])
  const asRow = ([k, d]: [string, string]): SheetRow => ({ keys: [k], label: d, description: d })
  const extras = extraSections.map((sec) => ({ ...sec, rows: sec.rows.filter(([k, d]) => matches(q, k, d)).map(asRow) })).filter((s) => s.rows.length > 0)
  const quickAdd = QUICK_ADD_SYNTAX.map(([k, d]): [string, string] => [k, t(d)]).filter(([k, d]) => matches(q, k, d)).map(asRow)
  const contextCount = contextSections(context).length
  const empty = groups.length === 0 && extras.length === 0 && quickAdd.length === 0

  return (
    // The shared Dialog: full screen on phones, a card from 640 px up with the
    // header pinned; from 640 px the sheet itself is capped and scrolls inside.
    <Dialog title={t('Keyboard shortcuts')} onClose={onClose} size="xl" className="!pt-2" testId="shortcut-help">
      <div role="search" className="mb-2">
        <label className="sr-only" htmlFor="shortcut-search">{t('Search shortcuts')}</label>
        <input id="shortcut-search" type="search" className="ui-input w-full" placeholder={t('Search by key or action')} value={query} autoFocus
          onChange={(e) => setQuery(e.target.value)} data-shortcut-search />
      </div>
      <p className="sr-only" aria-live="polite">{q ? t('{n, plural, one {# shortcut} other {# shortcuts}}', { n: groups.reduce((n, g) => n + g.rows.length, 0) + extras.reduce((n, s) => n + s.rows.length, 0) + quickAdd.length }) : ''}</p>
      <div className="sm:max-h-[calc(80dvh-9rem)] sm:overflow-y-auto sm:overscroll-contain" data-shortcut-sheet tabIndex={0} role="region" aria-label={t('Shortcuts')}>
        {empty && <p className="py-6 text-center text-body text-muted">{t('No shortcut matches “{q}”.', { q })}</p>}
        <div className="gap-x-8 md:columns-2 xl:columns-3">
          {groups.map((g, i) => (
            <section key={g.id} data-help-section={g.title} data-context-section={i < contextCount && !q ? '' : undefined} className="mb-3 break-inside-avoid">
              <h3 className="mb-1 mt-3 text-hint font-semibold uppercase tracking-wide text-faint">{g.title}{i < contextCount && !q ? <span className="ml-2 font-normal normal-case tracking-normal text-accent">{t('here')}</span> : null}</h3>
              <Rows rows={g.rows} />
            </section>
          ))}
          {extras.map((sec) => (
            <section key={sec.title} data-help-section={sec.title} className="mb-3 break-inside-avoid">
              <h3 className="mb-1 mt-3 text-hint font-semibold uppercase tracking-wide text-faint">{sec.title}</h3>
              {sec.note && <p className="mb-2 text-meta text-muted">{sec.note}</p>}
              <Rows rows={sec.rows} mono={sec.mono} />
            </section>
          ))}
          {quickAdd.length > 0 && (
            <section data-help-section="Quick add syntax" className="mb-3 break-inside-avoid">
              <h3 className="mb-1 mt-3 text-hint font-semibold uppercase tracking-wide text-faint">{t('Quick add syntax')}</h3>
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

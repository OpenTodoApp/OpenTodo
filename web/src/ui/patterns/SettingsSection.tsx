// Settings section and row (OpenSpec change ui-primitives, design D9; ux-overhaul
// settings-navigation "Panel cards and rows"): a card with heading, one-sentence
// description and rows. No actions and no help link in the header: the page
// header carries Help, and a section's primary action is a row's control.
// settings-copy D3: the one line may end with "Learn more", which opens the card's
// guide section beside the page; it is part of the line, never a header action.
// settings-refresh D1: a card may carry an icon before its title, from the copy table.
// precision-settings D3: every section is flat (no card surface, no icon before the
// heading): a label-size heading, its one line, then rows between hairlines.
// settings-foundation D2/D3: the heading outranks its rows (body size, semibold, the
// strong colour), and a section that is the only one on its page, or whose title is
// the page's title, shows no heading or line of its own: its line becomes the page's
// lead line through SettingsPageProvider, so no page repeats its title.
import { createContext, isValidElement, useCallback, useContext, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Badge } from '../Card'
import { LearnMore } from '../LearnMore'
import { Switch } from '../Switch'
import { t } from '../../lib/i18n'

interface SectionEntry { title: string; description?: ReactNode; learnMore?: string }

interface PageContext {
  title: string
  register: (key: string, title: string) => () => void
  /** The latest description and Learn more of each registered section (read by the page head). */
  details: Map<string, SectionEntry>
  keys: readonly string[]
  titles: ReadonlyMap<string, string>
}
const PageCtx = createContext<PageContext | null>(null)

/**
 * The settings page a set of sections belongs to (settings-foundation D2): it knows
 * the page's title and which top-level sections rendered, so a sole section, or one
 * titled like the page, can drop its heading and hand its line to the page head.
 */
export function SettingsPageProvider({ title, children }: { title: string; children: ReactNode }) {
  const [keys, setKeys] = useState<readonly string[]>([])
  const [titles, setTitles] = useState<ReadonlyMap<string, string>>(new Map())
  const details = useRef(new Map<string, SectionEntry>()).current
  const register = useCallback((key: string, sectionTitle: string) => {
    setKeys((k) => (k.includes(key) ? k : [...k, key]))
    setTitles((m) => (m.get(key) === sectionTitle ? m : new Map(m).set(key, sectionTitle)))
    return () => {
      setKeys((k) => k.filter((x) => x !== key))
      setTitles((m) => { const n = new Map(m); n.delete(key); return n })
      details.delete(key)
    }
  }, [details])
  const value = useMemo(() => ({ title, register, details, keys, titles }), [title, register, details, keys, titles])
  return <PageCtx.Provider value={value}>{children}</PageCtx.Provider>
}

function isBare(ctx: PageContext, key: string): boolean {
  if (!ctx.keys.includes(key)) return false
  return ctx.keys.length === 1 || ctx.titles.get(key) === ctx.title
}

/**
 * The line a page head shows when the page has no lead of its own: the first section
 * that gave up its heading. Undefined when every section keeps its heading.
 */
export function useSettingsPageLead(): SectionEntry | undefined {
  const ctx = useContext(PageCtx)
  if (!ctx) return undefined
  const key = ctx.keys.find((k) => isBare(ctx, k))
  return key ? ctx.details.get(key) : undefined
}

export interface SettingsSectionProps {
  title: string
  /** The section table's icon (settings-navigation "Card icons"): shown in search results, not on the page. */
  icon?: string
  description?: ReactNode
  /** Heading level: h2 under the section page's single h1 (default), h3 when nested. */
  level?: 2 | 3
  id?: string
  /** A stable heading id (kept from the earlier layout for links and tests); generated when absent. */
  headingId?: string
  /** A Help screen id: the line ends with a Learn more link that opens it beside the page. */
  learnMore?: string
  testId?: string
  children: ReactNode
}

export function SettingsSection({ title, description, level = 2, id, headingId: fixedId, learnMore, testId, children }: SettingsSectionProps) {
  const generated = useId()
  const headingId = fixedId ?? generated
  const ctx = useContext(PageCtx)
  const top = level === 2 && !!ctx
  if (top) ctx!.details.set(generated, { title, description, learnMore })
  const register = ctx?.register
  useLayoutEffect(() => (top && register ? register(generated, title) : undefined), [top, register, generated, title])
  const bare = top && isBare(ctx!, generated)
  const H = level === 2 ? 'h2' : 'h3'
  return (
    <section id={id} aria-labelledby={headingId} data-testid={testId} data-settings-card data-settings-bare={bare || undefined} className="ui-settings-section">
      <div className="min-w-0">
        {/* A bare section keeps its heading for assistive technology and links, but not on screen. */}
        <H id={headingId} className={`${bare ? 'sr-only' : ''} ${level === 2 ? 'text-body font-semibold text-strong' : 'text-body font-medium text-default'} outline-none`}>{title}</H>
        {!bare && (description || learnMore) && (
          <p className="mt-1 text-meta text-muted" data-settings-line>
            {description}
            {learnMore && <>{description ? ' ' : ''}<LearnMore screen={learnMore} topic={title} className="text-meta" /></>}
          </p>
        )}
      </div>
      <div className={`${bare ? '' : 'mt-3 '}divide-y divide-soft border-y border-soft`}>{children}</div>
    </section>
  )
}

export interface SettingRowProps {
  label: ReactNode
  description?: ReactNode
  /** The current state, as a badge beside the label. */
  status?: ReactNode
  control?: ReactNode
  /** id of the control, so the label names it. */
  htmlFor?: string
  /** An id for links and the settings search (the row scrolls into view and takes focus). */
  id?: string
  /** The control is a switch the row cannot recognise (wrapped in another element): keep it on the label's line. */
  inline?: boolean
  /** Stack the control under the label below 640 px even when it is a switch. */
  stack?: boolean
  /** "server": an owner's switch on a personal page; it applies to everyone on this server (settings-foundation D4). */
  scope?: 'server'
}

/**
 * A row's control is a switch (settings-foundation D6): the Switch itself, or a plain
 * element wrapping only a Switch (many rows wrap it in a span with a test attribute).
 */
function isSwitch(control: ReactNode): boolean {
  if (!isValidElement(control)) return false
  if (control.type === Switch) return true
  const children = (control.props as { children?: ReactNode }).children
  return typeof control.type === 'string' && isValidElement(children) && children.type === Switch
}

export function SettingRow({ label, description, status, control, htmlFor, id, inline, stack, scope }: SettingRowProps) {
  const Label = htmlFor ? 'label' : 'div'
  // settings-foundation D6: below 640 px a switch stays at the end of its label's line;
  // every other control stacks under the label.
  const keepInline = !stack && (inline || isSwitch(control))
  return (
    <div id={id} tabIndex={id ? -1 : undefined} data-setting-row={id} data-setting-inline={keepInline || undefined}
      className={`grid gap-3 py-3 outline-none focus-visible:rounded-control focus-visible:ring-2 focus-visible:ring-focus ${keepInline ? 'grid-cols-[minmax(0,1fr)_auto] items-center sm:gap-6' : 'sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6'}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Label {...(htmlFor ? { htmlFor } : {})} className="block text-body font-medium text-default">{label}</Label>
          {scope === 'server' && <Badge hue="slate" title={t('Applies to everyone on this server')}>{t('This server')}</Badge>}
          {status && <span className="text-meta text-default" data-setting-status>{status}</span>}
        </div>
        {description && <p className="mt-0.5 text-meta text-muted">{description}</p>}
      </div>
      {control && <div className={`flex flex-wrap items-center gap-2 ${keepInline ? 'justify-end' : 'sm:justify-end'}`} data-setting-control>{control}</div>}
    </div>
  )
}

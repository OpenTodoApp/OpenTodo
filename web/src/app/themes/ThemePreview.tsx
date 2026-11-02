// The theme editor's live preview (OpenSpec change theme-editor, design D9): real
// components (task rows, board cards, calendar blocks, the task panel's pieces)
// drawn from fixed sample data, never the user's own, in a subtree that carries the
// draft's resolved tokens, shape and type as custom properties, so the rest of the
// app keeps the active theme. The subtree is inert: no focus, no writes; it has a
// text description, and the contrast list and token rows are its accessible
// equivalent. Tabs switch between a list, a board, the week and the task panel.
import { useMemo, type CSSProperties, type ReactNode } from 'react'
import { weekdayName } from '../../lib/dates'
import { t } from '../../lib/i18n'
import type { ResolvedTheme } from '../../lib/theme/derive'
import { CSS_TOKENS, RADIUS_STEPS } from '../../lib/theme/tokens'
import { Button, Icon, Tabs } from '../../ui'
import { TaskCard, TaskRow } from '../TaskRow'
import { previewData, type PreviewData } from './previewData'

export type PreviewTab = 'list' | 'board' | 'calendar' | 'task'
export const PREVIEW_TABS: readonly PreviewTab[] = ['list', 'board', 'calendar', 'task']

/** The custom properties of a resolved theme, as the app sets them on the root. */
export function themeStyle(r: Pick<ResolvedTheme, 'tokens' | 'radius' | 'font' | 'list'>): CSSProperties {
  const style: Record<string, string> = {}
  for (const n of CSS_TOKENS) if (r.tokens[n]) style[`--ot-${n}`] = r.tokens[n]
  if (r.radius) for (const s of RADIUS_STEPS) style[`--ot-radius-${s}`] = `${r.radius[s]}px`
  if (r.font) style['--ot-font'] = r.font
  style['--ot-text-list'] = `${(r.list ?? 13) / 16}rem`
  return style as CSSProperties
}

const noop = () => {}
const base = { selected: false, showProject: false, onToggle: noop, onOpen: noop }
const DAYS = [0, 1, 2, 3, 4, 5, 6]
const HOURS = [9, 10, 11, 12, 13, 14, 15, 16]

function ListScreen({ d }: { d: PreviewData }) {
  const labelsOf = (ids: string[]) => d.labels.filter((l) => ids.includes(l.id))
  return (
    <div className="flex flex-col gap-3">
      <p className="text-h3 font-semibold text-strong">{d.project.name}</p>
      {d.sections.map((s, i) => (
        <section key={s.name} className="flex flex-col gap-1">
          <p className="text-meta font-semibold text-muted">{s.name}</p>
          <ul className="space-y-0.5 rounded-card border border-default bg-surface p-1.5">
            {s.tasks.map((task, j) => <TaskRow key={task.id} {...base} selected={i === 0 && j === 1} task={task} labels={labelsOf(task.labels)} />)}
          </ul>
        </section>
      ))}
    </div>
  )
}

function BoardScreen({ d }: { d: PreviewData }) {
  const labelsOf = (ids: string[]) => d.labels.filter((l) => ids.includes(l.id))
  return (
    <div className="grid grid-cols-3 gap-2">
      {d.columns.map((c) => (
        <section key={c.name} className="flex min-w-0 flex-col gap-1.5 rounded-card bg-sunken p-1.5">
          <p className="px-1 text-meta font-semibold text-muted">{c.name} <span className="text-faint">{c.tasks.length}</span></p>
          <ul className="space-y-1.5">{c.tasks.map((task) => <TaskCard key={task.id} {...base} task={task} labels={labelsOf(task.labels)} />)}</ul>
        </section>
      ))}
    </div>
  )
}

function CalendarScreen({ d }: { d: PreviewData }) {
  const names = useMemo(() => DAYS.map((i) => weekdayName((i + 1) % 7, 'short')), [])
  const row = (h: number) => h - HOURS[0] + 2
  return (
    <div className="grid grid-cols-[2.5rem_repeat(7,minmax(0,1fr))] grid-rows-[auto_auto_repeat(8,2.25rem)] gap-px overflow-hidden rounded-card border border-default bg-(--ot-border-soft) text-meta">
      <span className="bg-surface" />
      {names.map((n, i) => <span key={i} className={`bg-surface px-1 py-1 text-center ${i === 2 ? 'font-semibold text-accent' : 'text-muted'}`}>{n}</span>)}
      <span className="bg-surface px-1 text-hint text-faint" style={{ gridRow: 2 }}>{t('All day')}</span>
      {DAYS.map((i) => <span key={i} className="bg-surface" style={{ gridRow: 2, gridColumn: i + 2 }} />)}
      {d.allDay.map((a) => (
        <span key={a.title} data-hue={a.hue} className="ui-block ui-block--row z-[1] m-0.5 truncate px-1.5 py-0.5" style={{ gridRow: 2, gridColumn: `${a.day + 2} / span ${a.span}` }}>{a.title}</span>
      ))}
      {HOURS.map((h) => (
        <span key={h} className="bg-surface px-1 text-right text-hint text-faint" style={{ gridRow: row(h) }}>{h}</span>
      ))}
      {HOURS.flatMap((h) => DAYS.map((i) => <span key={`${h}-${i}`} className={i === 2 ? 'bg-raised' : 'bg-surface'} style={{ gridRow: row(h), gridColumn: i + 2 }} />))}
      {d.blocks.map((b) => (
        <span key={b.title} data-hue={b.hue} className={`ui-block z-[1] m-0.5 overflow-hidden px-1.5 py-1 ${b.past ? 'ui-block--past' : ''}`}
          style={{ gridColumn: b.day + 2, gridRow: `${row(b.from)} / ${row(b.to)}` }}>{b.title}</span>
      ))}
    </div>
  )
}

function TaskScreen({ d }: { d: PreviewData }) {
  const { task, subtasks, comment } = d.panel
  const labels = d.labels.filter((l) => task.labels.includes(l.id))
  return (
    <div className="flex flex-col gap-3 rounded-surface border border-default bg-raised p-4 shadow-2">
      <p className="text-h3 font-semibold text-strong">{task.title}</p>
      <p className="flex flex-wrap items-center gap-2 text-meta">
        <span className="rounded-chip bg-danger-soft px-1.5 text-on-danger-soft">{t('Priority 1')}</span>
        <span className="text-warning">{t('Today')}</span>
        {labels.map((l) => <span key={l.id} data-hue="orange" className="rounded-chip bg-hue-soft px-1.5 text-hue">{l.name}</span>)}
      </p>
      <p className="text-body text-default">{t('Compare the samples in daylight and in the evening before ordering.')}</p>
      <ul className="flex flex-col gap-1">
        {subtasks.map((s) => (
          <li key={s.title} className={`flex items-center gap-2 text-body ${s.done ? 'text-faint line-through' : 'text-default'}`}>
            <Icon name={s.done ? 'circle-check-big' : 'circle'} className={s.done ? 'text-success' : 'text-muted'} />{s.title}
          </li>
        ))}
      </ul>
      <div className="rounded-card border border-soft bg-surface p-2">
        <p className="text-meta text-muted">{t('Ada · yesterday')}</p>
        <p className="text-body text-default">{comment}</p>
        <p className="text-meta"><span className="rounded-chip bg-highlight px-1 text-on-highlight">{t('warm white')}</span> <a className="text-accent underline">{t('Paint chart')}</a></p>
      </div>
      <div className="flex gap-2"><Button variant="primary">{t('Save')}</Button><Button variant="secondary">{t('Cancel')}</Button><Button variant="ghost" className="text-danger">{t('Delete')}</Button></div>
    </div>
  )
}

const DESCRIPTION: Record<PreviewTab, () => string> = {
  list: () => t('Preview of the theme on a task list'),
  board: () => t('Preview of the theme on a board'),
  calendar: () => t('Preview of the theme on the week calendar'),
  task: () => t('Preview of the theme on the task panel'),
}

export interface ThemePreviewProps {
  resolved: ResolvedTheme | null
  kind: 'light' | 'dark'
  tab: PreviewTab
  onTab: (t: PreviewTab) => void
  /** While a newer draft is being derived. */
  pending?: boolean
}

/** The themed, inert sample of one screen. */
export function PreviewSurface({ resolved, kind, tab, children }: { resolved: ResolvedTheme | null; kind: 'light' | 'dark'; tab: PreviewTab; children?: ReactNode }) {
  const d = useMemo(() => previewData(), [])
  const style = resolved ? themeStyle(resolved) : undefined
  const screen = tab === 'list' ? <ListScreen d={d} /> : tab === 'board' ? <BoardScreen d={d} /> : tab === 'calendar' ? <CalendarScreen d={d} /> : <TaskScreen d={d} />
  return (
    <div data-theme={kind} data-theme-preview={tab} style={style} inert aria-label={DESCRIPTION[tab]()} role="img"
      className="rounded-card bg-canvas p-3 font-sans text-default">
      {screen}
      {children}
    </div>
  )
}

export function ThemePreview({ resolved, kind, tab, onTab, pending }: ThemePreviewProps) {
  const tabs = PREVIEW_TABS.map((id) => ({ id, label: id === 'list' ? t('List') : id === 'board' ? t('Board') : id === 'calendar' ? t('Week') : t('Task') }))
  return (
    <div className="flex flex-col gap-2" data-theme-preview-root aria-busy={pending || undefined}>
      <Tabs tabs={tabs} value={tab} onChange={(v) => onTab(v as PreviewTab)} label={t('Preview')}>
        <PreviewSurface resolved={resolved} kind={kind} tab={tab} />
      </Tabs>
    </div>
  )
}

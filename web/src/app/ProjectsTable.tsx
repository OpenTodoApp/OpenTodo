// The All projects table (OpenSpec change projects-table, design D1 to D6): one row
// per project of the tree, with its health, progress, open tasks, next due date,
// people and last change, all worked out on the device (lib/projectHealth.ts). The
// headers sort the rows among their siblings, so the tree stays a tree. The table is
// its own size container: its columns drop from the end as it narrows, down to the
// name and the health word on a phone. Arrow keys (and j, k) move between rows,
// Left and Right fold and unfold, Enter opens. Where the health detail is dropped, the
// word says why in a tooltip and on a tap (briefing-links D5).
import { type KeyboardEvent, type MouseEvent, type RefObject, useEffect, useRef, useState } from 'react'
import { addDaysISO, describeDue, logicalDay } from '../lib/dates'
import type { HealthWord, ProjectSortKey, ProjectSummary } from '../lib/projectHealth'
import { avatarUrl } from '../lib/avatars'
import type { Membership, Project } from '../lib/types'
import type { TreeNode } from '../lib/tree'
import { t } from '../lib/i18n'
import { Avatar, Icon, ProgressRing, ReadAs, ToneText, Tooltip, type IconName, type Tone } from '../ui'
import { ProjectRowMenu } from './ProjectRowMenu'
import { navigate } from './router'
import { ProjectMark } from './Sidebar'
import { MAX_INDENT } from './TaskRow'
import { useDateTimeFormat } from './DateTimePrefsProvider'

export interface ProjectsSort { key: ProjectSortKey; dir: 1 | -1 }

/** The columns after the name, in order; `from` is the table width a column needs (design D6). */
const COLUMNS: { key: ProjectSortKey | 'people'; label: () => string; from: string; width: string }[] = [
  { key: 'health', label: () => t('Health'), from: 'hidden @min-[18rem]/projects:table-cell', width: 'w-[7.5rem] @min-[36rem]/projects:w-[13rem]' },
  { key: 'progress', label: () => t('Progress'), from: 'hidden @min-[52rem]/projects:table-cell', width: 'w-[6.5rem]' },
  { key: 'open', label: () => t('Open', { context: 'count' }), from: 'hidden @min-[36rem]/projects:table-cell', width: 'w-[4.5rem]' },
  { key: 'next-due', label: () => t('Next due'), from: 'hidden @min-[44rem]/projects:table-cell', width: 'w-[7.5rem]' },
  { key: 'people', label: () => t('People'), from: 'hidden @min-[60rem]/projects:table-cell', width: 'w-[6rem]' },
  { key: 'updated', label: () => t('Updated'), from: 'hidden @min-[68rem]/projects:table-cell', width: 'w-[7.5rem]' },
]
const cellOf = (key: (typeof COLUMNS)[number]['key']) => COLUMNS.find((c) => c.key === key)!.from

const HEALTH: Record<HealthWord, { label: () => string; icon: IconName; tone: Tone }> = {
  late: { label: () => t('Late'), icon: 'circle-alert', tone: 'danger' },
  slipping: { label: () => t('Overdue'), icon: 'activity', tone: 'warning' },
  quiet: { label: () => t('Quiet'), icon: 'clock', tone: 'muted' },
  'on-track': { label: () => t('On track'), icon: 'trending-up', tone: 'success' },
}

/** The detail after the health word: the late count, the task past its deadline, or the quiet days. */
function healthDetail(s: ProjectSummary): string | null {
  const h = s.health
  switch (h.word) {
    case 'late': return h.pastDeadline === 1 && h.firstPastDeadline ? h.firstPastDeadline.title : t('{n, plural, one {# past its deadline} other {# past their deadline}}', { n: h.pastDeadline })
    case 'slipping': return t('{n} late', { n: h.late })
    case 'quiet': return t('{n, plural, one {# day} other {# days}}', { n: h.quietDays ?? 0 })
    default: return null
  }
}

/** The table width, in rem, from which the health detail shows beside the word (projects-table D6). */
const DETAIL_FROM_REM = 36

/** Whether the table is too narrow for the health detail, from its container's width. */
function useNarrow(el: RefObject<HTMLElement | null>): boolean {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const node = el.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
    const ro = new ResizeObserver(() => setNarrow(node.clientWidth < DETAIL_FROM_REM * rem()))
    ro.observe(node)
    return () => ro.disconnect()
  }, [el])
  return narrow
}

function HealthCell({ summary, narrow }: { summary: ProjectSummary | undefined; narrow: boolean }) {
  const [shown, setShown] = useState(false)
  const word = summary?.health.word
  if (!summary || !word) return <span className="text-meta text-faint">{t('Nothing open')}</span>
  const h = HEALTH[word]
  const detail = healthDetail(summary)
  const userText = word === 'late' && summary.health.pastDeadline === 1 ? 'user-text' : ''
  const label = <ToneText tone={h.tone} icon={h.icon} className="shrink-0 text-body">{h.label()}</ToneText>
  // Narrow: the word is a button that shows why, on hover and focus as a tooltip and on a tap in place.
  if (narrow && detail) return (
    <span className="flex min-w-0 flex-col items-start" data-health={word}>
      <Tooltip label={detail}>
        <button type="button" className="briefing-link flex items-center" aria-expanded={shown} onClick={() => setShown((v) => !v)} data-health-why>
          {label}<span className="sr-only">{`, ${detail}`}</span>
        </button>
      </Tooltip>
      {shown && <span className={`min-w-0 max-w-full truncate text-meta text-faint ${userText}`} aria-hidden="true" data-health-detail>{detail}</span>}
    </span>
  )
  return (
    <span className="flex min-w-0 items-center gap-1" data-health={word}>
      {label}
      {detail && <span className="sr-only min-w-0 truncate text-meta text-faint @min-[36rem]/projects:not-sr-only @min-[36rem]/projects:inline">
        <span aria-hidden="true">· </span><span className={userText}>{detail}</span>
      </span>}
    </span>
  )
}

/** The last change as a short phrase: minutes, hours, yesterday, days, then the date. */
export function updatedLabel(ms: number, now: number, today: string, formatDate: (iso: string) => string): string {
  const s = Math.max(0, Math.round((now - ms) / 1000))
  if (s < 60) return t('just now')
  const m = Math.round(s / 60)
  if (m < 60) return t('{m} min ago', { m })
  const day = logicalDay(ms)
  if (day === today) return t('{h} h ago', { h: Math.round(m / 60) })
  if (day === addDaysISO(today, -1)) return t('yesterday')
  for (let n = 2; n < 30; n++) if (day === addDaysISO(today, -n)) return t('{n} days ago', { n })
  return formatDate(day)
}

export interface ProjectsTableProps {
  rows: TreeNode<Project>[]
  summaries: Map<string, ProjectSummary>
  memberships: Map<string, Membership>
  /** The ids whose name is dimmed: ancestors kept by the find field. */
  dimmed?: ReadonlySet<string>
  folded: ReadonlySet<string>
  /** Folding is off while the find field narrows the tree. */
  foldable: boolean
  onFold: (id: string, fold: boolean) => void
  sort: ProjectsSort | null
  onSort: (key: ProjectSortKey) => void
  today: string
  now: number
  canMove: (n: TreeNode<Project>) => boolean
  edges: (n: TreeNode<Project>) => { first: boolean; last: boolean }
}

export function ProjectsTable({ rows, summaries, memberships, dimmed, folded, foldable, onFold, sort, onSort, today, now, canMove, edges }: ProjectsTableProps) {
  const dt = useDateTimeFormat()
  const body = useRef<HTMLTableSectionElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  const narrow = useNarrow(frame)
  const opens = () => [...(body.current?.querySelectorAll<HTMLButtonElement>('[data-project-open]') ?? [])]
  const onKey = (e: KeyboardEvent<HTMLTableSectionElement>) => {
    const target = e.target as HTMLElement
    if (!target.matches('[data-project-open]') || e.metaKey || e.ctrlKey || e.altKey) return
    const list = opens()
    const i = list.indexOf(target as HTMLButtonElement)
    const go = (j: number) => { e.preventDefault(); list[Math.max(0, Math.min(list.length - 1, j))]?.focus() }
    const id = target.dataset.projectOpen!
    const node = rows.find((n) => n.id === id)
    switch (e.key) {
      case 'ArrowDown': case 'j': return go(i + 1)
      case 'ArrowUp': case 'k': return go(i - 1)
      case 'Home': return go(0)
      case 'End': return go(list.length - 1)
      case 'ArrowRight':
        if (foldable && node?.children.length && folded.has(id)) { e.preventDefault(); onFold(id, false) }
        return
      case 'ArrowLeft':
        if (foldable && node?.children.length && !folded.has(id)) { e.preventDefault(); onFold(id, true) }
        else if (node?.parent) { e.preventDefault(); list.find((b) => b.dataset.projectOpen === node.parent)?.focus() }
        return
    }
  }
  // A click anywhere on the row opens the project, except on its own controls.
  const onRowClick = (e: MouseEvent<HTMLTableRowElement>, id: string) => {
    if ((e.target as HTMLElement).closest('button, a, [role="menu"]')) return
    navigate({ view: 'project', id })
  }

  return (
    <div ref={frame} className="@container/projects" data-projects-table>
      <table className="w-full table-fixed border-collapse text-left" aria-label={t('Projects')}>
        <thead>
          <tr className="border-b border-soft">
            <SortHeader label={t('Name')} sortKey="name" sort={sort} onSort={onSort} className="pl-8 pr-2" />
            {COLUMNS.map((c) => c.key === 'people'
              ? <th key={c.key} scope="col" className={`${c.from} ${c.width} px-2 py-2 text-meta font-medium text-muted`}>{c.label()}</th>
              : <SortHeader key={c.key} label={c.label()} sortKey={c.key} sort={sort} onSort={onSort} className={`${c.from} ${c.width} px-2`} />)}
            <th scope="col" className="w-9"><span className="sr-only">{t('Actions')}</span></th>
          </tr>
        </thead>
        <tbody ref={body} onKeyDown={onKey}>
          {rows.map((n) => {
            const p = n.item
            const s = summaries.get(n.id)
            const has = n.children.length > 0
            const isFolded = foldable && folded.has(n.id)
            const due = s?.nextDue ? describeDue(s.nextDue, today, undefined, dt.resolved) : null
            const members = memberships.get(n.id)?.members ?? []
            return (
              <tr key={n.id} data-projects-row={n.id} onClick={(e) => onRowClick(e, n.id)}
                className="group cursor-pointer border-b border-soft row-hover focus-within:bg-selected">
                <td className="min-w-0 py-0">
                  <div className="flex min-h-11 min-w-0 items-center" style={{ paddingLeft: `${Math.min(n.depth, MAX_INDENT) * 1.25}rem` }}>
                    <span className="flex h-8 w-6 shrink-0 items-center justify-center pointer-coarse:h-11 pointer-coarse:w-11">
                      {has && foldable && (
                        <button type="button" tabIndex={-1} onClick={() => onFold(n.id, !isFolded)} aria-expanded={!isFolded}
                          aria-label={isFolded ? t('Expand {name}', { name: p.name }) : t('Collapse {name}', { name: p.name })}
                          className="flex h-6 w-6 items-center justify-center rounded-chip text-faint hover:text-muted">
                          <Icon name="chevron-right" size="xs" className={`transition-transform duration-(--duration-ui) ${isFolded ? '' : 'rotate-90'}`} />
                        </button>
                      )}
                    </span>
                    <button type="button" onClick={() => navigate({ view: 'project', id: n.id })} data-project-open={n.id}
                      aria-expanded={has && foldable ? !isFolded : undefined}
                      className={`flex min-w-0 flex-1 items-center gap-2 rounded-control py-1.5 pr-2 text-left text-body font-medium outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-focus ${dimmed?.has(n.id) ? 'text-faint' : 'text-strong'}`}>
                      <span className="flex w-5 shrink-0 justify-center"><ProjectMark project={p} /></span>
                      <span className="user-text min-w-0 flex-1 truncate">{p.name}</span>
                    </button>
                  </div>
                  {/* Too narrow for a health column (a large text size on a phone): the health sits under the name. */}
                  <div className="-mt-1.5 pb-2 pointer-coarse:ml-5 @min-[18rem]/projects:hidden" style={{ paddingLeft: `${Math.min(n.depth, MAX_INDENT) * 1.25 + 3.25}rem` }} data-health-under>
                    <HealthCell summary={s} narrow />
                  </div>
                </td>
                <td className={`${cellOf('health')} px-2`}><HealthCell summary={s} narrow={narrow} /></td>
                <td className={`${cellOf('progress')} px-2`}>
                  {s?.progress != null && <span className="inline-flex items-center gap-1.5 text-body tabular-nums text-default">
                    <ProgressRing value={s.progress} /><ReadAs label={t('{n}% done', { n: Math.round(s.progress * 100) })}>{`${Math.round(s.progress * 100)}%`}</ReadAs>
                  </span>}
                </td>
                <td className={`${cellOf('open')} px-2 text-body tabular-nums text-default`}>
                  <ReadAs label={t('{n, plural, one {# open task} other {# open tasks}}', { n: s?.open ?? 0 })}>{s?.open ? String(s.open) : ''}</ReadAs>
                </td>
                <td className={`${cellOf('next-due')} px-2`}>
                  {due && <ToneText tone={s!.nextDueLate ? 'danger' : 'default'} icon="calendar-days" className="text-body" data-next-due={s!.nextDueLate ? 'late' : ''}>{due.label}</ToneText>}
                </td>
                <td className={`${cellOf('people')} px-2`}>
                  {members.length > 0 && <span className="flex items-center -space-x-1.5" role="img" aria-label={members.map((m) => m.name || m.email).join(', ')}>
                    {members.slice(0, 3).map((m) => <Avatar key={m.userId} id={m.userId} name={m.name || m.email} size="sm" className="ring-2 ring-surface"
                      src={m.avatarVersion ? avatarUrl(m.userId, m.avatarVersion) : undefined} />)}
                    {members.length > 3 && <span className="pl-2.5 text-meta tabular-nums text-faint">{`+${members.length - 3}`}</span>}
                  </span>}
                </td>
                <td className={`${cellOf('updated')} px-2 text-meta text-muted`}>
                  {s?.updated ? updatedLabel(s.updated, now, today, (iso) => dt.formatDate(iso, 'compact')) : ''}
                </td>
                <td className="pr-1 text-right">
                  <ProjectRowMenu project={p} movable={canMove(n)} edges={edges(n)} className="hover-reveal" />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function SortHeader({ label, sortKey, sort, onSort, className }: { label: string; sortKey: ProjectSortKey; sort: ProjectsSort | null; onSort: (key: ProjectSortKey) => void; className: string }) {
  const active = sort?.key === sortKey
  return (
    <th scope="col" aria-sort={active ? (sort!.dir === 1 ? 'ascending' : 'descending') : undefined} className={`${className} py-1 font-normal`}>
      <button type="button" onClick={() => onSort(sortKey)} data-sort={sortKey}
        className={`-mx-1 inline-flex items-center gap-1 rounded-chip px-1 py-1 text-meta font-medium ${active ? 'text-default' : 'text-muted hover:text-default'}`}>
        {label}
        {active && <Icon name={sort!.dir === 1 ? 'arrow-up' : 'arrow-down'} size="xs" />}
      </button>
    </th>
  )
}

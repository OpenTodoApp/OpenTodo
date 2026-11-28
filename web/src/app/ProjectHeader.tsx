import { Button, Icon, PageHeader, ProgressRing, ReadAs, Tooltip } from '../ui'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { useDemo } from '../lib/demo'
import { useOnline } from '../lib/online'
import { canEditTasks, canManageMembers } from '../lib/sharing'
import type { Project } from '../lib/types'
import { ActionMenu, type ActionGroup } from './menus/ActionMenu'
import { useProjectMenu } from './menus/useProjectMenu'
import { renameProject } from './menus/projectAppearance'
import { ProjectMark } from './Sidebar'
import { useShortcutScope } from './shortcuts'
import { keysOf } from '../lib/shortcuts'
import { t } from '../lib/i18n'
import { roleName } from '../lib/roleNames'
import { inMaintenance } from '../lib/reviewCadence'
import { useLiveTasks, useOpenTaskCount } from '../lib/liveTasks'
import { percentOf, projectProgressOf, shareOf, showsProgress } from '../lib/progress'
import { useProjectViewMode, useShowCompletedPref } from '../lib/liveData'
import { saveShowCompleted } from '../lib/sections'
import { isReusable } from '../lib/reusable'
import { printItems } from './menus/printItem'
import { composing } from '../lib/composeKey'

export { moveTargets, projectMenuGroups, type MoveTarget } from './menus/projectMenu'


export function ProjectHeader({ project, userId, actions, layout, subtitle, phone, extraGroups, lead, secondary, print }: {
  project: Project
  /** The list layout offers Print… (print-lists). */
  print?: boolean
  userId?: string
  /** Items the layout adds to the project menu (a board's Colour by, calendar-clarity D3). */
  extraGroups?: ActionGroup[]
  /** The layout's part of the lead line (the Calendar layout's filter chip, calendar-clarity D5). */
  lead?: ReactNode
  /** A second row under the title (the Calendar layout's range controls, calendar-clarity D5). */
  secondary?: ReactNode
  /** Below 768 px, a line under the title in the shell's bar (the board's current column). */
  subtitle?: ReactNode
  /** Page actions rendered after Share (the duration filter, touch Select). */
  actions?: ReactNode
  /** The List/Board control, first among the actions (app-shell "Page template"). */
  layout?: ReactNode
  /** Below 768 px (phone-v2 D1) and in a column narrower than 40 rem (tablet-header-room): the bar's or the row's visible slots, and items for the project menu (Layout, Share, the list's own). */
  phone?: { slots: ReactNode; groups: ActionGroup[] }
}) {
  const [nameEdit, setNameEdit] = useState<{ projectId: string; value: string } | null>(null)
  const currentNameEdit = nameEdit?.projectId === project.id ? nameEdit : null
  const [menuOpen, setMenuOpen] = useState(false)
  const [startPicker, setStartPicker] = useState<string | null>(null)
  // The "Public" badge (public-links): read from the server while online, for the
  // owner and admins only; never from synced data, so it is absent offline.
  const online = useOnline()
  const demo = useDemo()
  const [publicLinks, setPublicLinks] = useState(0)

  const openTasks = useOpenTaskCount(project.id)
  // The project's own progress beside its title (task-progress D4): the All projects rule, patched per write; an area never finishes and a reusable list is restocked, so neither has one (showsProgress).
  const liveTasks = useLiveTasks()
  const share = liveTasks && showsProgress(project) ? shareOf(projectProgressOf(liveTasks).get(project.id)) : null
  const percent = share === null ? null : percentOf(share)
  // "Show completed tasks" (project-completed-section): a preference of this device, in the list and the board (board-completed-column D1).
  const layoutMode = useProjectViewMode(project.id)
  const completedLayout = layoutMode === 'list' || layoutMode === 'board'
  const showCompleted = useShowCompletedPref(project.id)
  // The whole project menu, shared with the sidebar row (sidebar-project-menu).
  const menu = useProjectMenu(project, { userId, rename: () => setNameEdit({ projectId: project.id, value: project.name }), page: {
    // A reusable list always shows its ticked items (reusable-lists D7), so it offers no switch.
    before: completedLayout && !isReusable(project) ? [{ kind: 'check', id: 'show-completed', label: t('Show completed tasks'), icon: 'circle-check-big', checked: showCompleted, onSelect: () => saveShowCompleted(project.id, !showCompleted) }] : [],
    after: print ? printItems() : [], extra: extraGroups, openTasks, onPublicLinks: setPublicLinks,
  } })
  const { membership, role, editable } = menu
  const managesLinks = canManageMembers(role) && !demo
  useEffect(() => {
    if (!online || !managesLinks) { setPublicLinks(0); return }
    let cancelled = false
    api.listPublicLinks(project.id).then((r) => { if (!cancelled) setPublicLinks(r.links.length) }, () => { if (!cancelled) setPublicLinks(0) })
    return () => { cancelled = true }
  }, [online, managesLinks, project.id])
  const showActivity = menu.activity

  const activityRef = useRef(showActivity)
  activityRef.current = showActivity

  // `m` opens the menu on the Move picker, so a move is reachable without a mouse;
  // Shift+S opens the share dialog (members, roles, leave, transfer); Shift+H the activity.
  // The project's `view` scope (keyboard-shortcuts "Resolved conflicts"): Shift+S shares, Shift+H toggles the activity, `m` moves.
  useShortcutScope('view', {
    'project.share': () => menu.share(),
    'project.activity': () => activityRef.current(),
    // `m` opens the menu straight into the "Move to" picker step.
    'project.move': () => { if (!editable) return false; setStartPicker('move'); setMenuOpen(true) },
    // Shift+F opens the Fields dialog for editors and above (custom-fields).
    'project.fields': () => { if (!canEditTasks(role)) return false; menu.fields() },
  }, { view: 'project' })

  async function save() {
    setNameEdit(null)
    const name = currentNameEdit?.value ?? project.name
    await renameProject(project, name)
  }

  const startEditing = () => setNameEdit({ projectId: project.id, value: project.name })

  const groups = menu.groups

  // On a phone Share is a menu item, since the bar keeps two slots (phone-v2 D1).
  const shareItem = menu.shareItem

  const title = currentNameEdit ? (
    <input className="ui-input max-w-xs text-h1 font-semibold" autoFocus value={currentNameEdit.value} onChange={(e) => setNameEdit({ projectId: project.id, value: e.target.value })} aria-label={t('Project name')}
      onBlur={() => void save()} onKeyDown={(e) => { if (composing(e)) return; if (e.key === 'Enter') void save(); if (e.key === 'Escape') setNameEdit(null) }} />
  ) : editable ? (
    <Tooltip label={t('Rename')}><button type="button" className="user-text min-w-0 truncate rounded-control text-start hover:bg-sunken dark:hover:bg-raised" onClick={startEditing} data-project-name>{project.name}</button></Tooltip>
  ) : <span className="user-text min-w-0 truncate" data-project-name>{project.name}</span>

  // The list page waits for the membership (audit M12), so this row has its final content at first paint.
  const meta = (
    <span className="flex flex-wrap items-center gap-x-2">
      {share !== null && (
        <span data-project-progress="" className="inline-flex min-h-6 items-center gap-1.5 text-meta tabular-nums text-muted">
          <ProgressRing value={share} /><ReadAs label={t('{n}% done', { n: percent })}>{`${percent}%`}</ReadAs>
        </span>
      )}
      {membership && (
        <button type="button" className="flex min-h-6 items-center gap-1 text-meta text-muted hover:text-default" onClick={() => menu.share()}>
          {/* Named by its content (WCAG 2.5.3 Label in Name): the member list is visually hidden, the initials and count are not read. */}
          <span className="sr-only">{t('Members: {list}', { list: membership.members.map((m) => `${m.name || m.email} (${roleName(m.role)})`).join(', ') })}</span>
          <span aria-hidden className="flex -space-x-1">
            {membership.members.slice(0, 4).map((m) => (
              <span key={m.userId} className="flex h-5 w-5 items-center justify-center rounded-full border border-surface bg-sunken text-hint font-semibold uppercase text-muted dark:bg-raised">
                {(m.name || m.email).slice(0, 1)}
              </span>
            ))}
          </span>
          <span aria-hidden>{membership.members.length} · {roleName(role)}</span>
        </button>
      )}
      {role === 'viewer' && <span role="note" className="rounded-chip bg-sunken px-1.5 py-0.5 text-meta text-muted">{t('Read-only')}</span>}
      {/* project-review-cadence: the shared status, inside the existing lead line. */}
      {inMaintenance(project) && <span role="note" data-project-maintenance className="inline-flex items-center gap-1 rounded-chip bg-sunken px-1.5 py-0.5 text-meta text-muted"><Icon name="wrench" size="xs" />{t('In maintenance')}</span>}
      {lead}
      {online && managesLinks && publicLinks > 0 && (
        <button type="button" data-public-badge onClick={() => menu.share('public')}
          aria-label={t('{n, plural, one {Public: # active link. Open the public links} other {Public: # active links. Open the public links}}', { n: publicLinks })}
          className="inline-flex min-h-6 items-center gap-1 rounded-chip bg-warning-soft px-1.5 text-meta font-medium text-on-warning-soft hover:underline">
          <Icon name="globe" size="xs" />{t('Public')}
        </button>
      )}
    </span>
  )

  // On a phone the bar's line under the title is plain text (ux-fixes-phone, audit M12): the
  // members and the public links open from Share in the project menu, and 44 px controls
  // there would make the bar grow when the membership arrives. A narrow header's own row
  // shows the same text as its lead line, whole or not at all (tablet-header-room).
  const phoneMeta = [
    percent === null ? '' : t('{n}% done', { n: percent }),
    membership ? `${membership.members.length} · ${roleName(role)}` : '',
    role === 'viewer' ? t('Read-only') : '',
    inMaintenance(project) ? t('In maintenance') : '',
    online && managesLinks && publicLinks > 0 ? t('Public') : '',
  ].filter(Boolean).join(' · ')

  return (
    <>
      <PageHeader title={title} subtitle={phone ? (subtitle ?? phoneMeta) : subtitle} leading={<ProjectMark project={project} size="md" />} meta={phone ? phoneMeta : meta} help="project"
        barActions={!!phone}
        actions={phone ? phone.slots : <>
          {layout}
          <Tooltip label={canManageMembers(role) ? t('Share project') : t('Members')} shortcut={keysOf('project.share')}>
            <Button variant="ghost" size="sm" icon="users" onClick={() => menu.share()} aria-haspopup="dialog" data-project-share>
              {/* Beside the display options the header is full at 768 px: the word joins the tooltip below 1024 px. */}
              <span className="max-lg:sr-only">{canManageMembers(role) ? t('Share') : t('Members')}</span>
            </Button>
          </Tooltip>
          {actions}
        </>}
        menu={<ActionMenu label={t('Project menu')} title={project.name} groups={phone ? [...phone.groups, { items: [shareItem] }, ...groups] : groups}
          header={menu.swatches}
          trigger={<Icon name="ellipsis" size="md" />} triggerClassName="ui-btn ui-btn--ghost ui-btn--sm touch-target px-2 py-1.5" width="sm:w-72"
          open={menuOpen} onOpenChange={(v) => { setMenuOpen(v); if (!v) setStartPicker(null) }} startPicker={startPicker} />}>
        {secondary}
      </PageHeader>
      {menu.dialogs}
    </>
  )
}

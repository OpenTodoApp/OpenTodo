// A project row's menu in the sidebar, the Favourites group and the All projects page
// (sidebar-favourites D3). In the sidebar (the tree and Favourites) it is the project
// header's whole menu (sidebar-project-menu, useProjectMenu), with Move up and Move down
// for the row; on the All projects page it keeps "Pin to sidebar", the moves and the
// project's flow. The pin is the user's own preference (never a project op); the moves
// reorder the favourites when the menu is opened from the Favourites group, else the
// project among its siblings, which only its owner or an admin may do.
import { useState } from 'react'
import { favouriteEdges, moveFavourite, setFavourite } from '../lib/favourites'
import { moveProjectBy } from '../lib/move'
import type { Project } from '../lib/types'
import { t } from '../lib/i18n'
import { ActionMenu, type ActionGroup } from './menus/ActionMenu'
import { pinItem } from './menus/pinItem'
import { useFavourites, useIsFavourite } from './useFavourites'
import { projectFlowItem } from './menus/flowMenu'
import { maintenanceItem } from './menus/reviewMenu'
import { useMethodMode } from '../lib/method/mode'
import { useMembership } from '../lib/localData'
import { canEditProject } from '../lib/sharing'
import { NamePrompt } from './NamePrompt'
import { renameProject } from './menus/projectAppearance'
import { useProjectMenu } from './menus/useProjectMenu'
import { useCurrentUserId } from '../lib/sharing'

/** Move up and Move down for a row (none when the user may not reorder it). */
function rowMoveGroups(move: ((d: -1 | 1) => unknown) | undefined, first: boolean, last: boolean): ActionGroup[] {
  return move ? [{ items: [
    { kind: 'action' as const, id: 'up', label: t('Move up'), icon: 'arrow-up' as const, shortcut: 'Alt+↑', disabled: first, reason: t('Already first'), onSelect: () => move(-1) },
    { kind: 'action' as const, id: 'down', label: t('Move down'), icon: 'arrow-down' as const, shortcut: 'Alt+↓', disabled: last, reason: t('Already last'), onSelect: () => move(1) },
  ] }] : []
}

export function projectRowMenuGroups(a: { pinned: boolean; pin: () => unknown; move?: (d: -1 | 1) => unknown; first: boolean; last: boolean }): ActionGroup[] {
  return [{ items: [pinItem(a.pinned, a.pin)] }, ...rowMoveGroups(a.move, a.first, a.last)]
}

/** The row's place and its moves: among the favourites in that group, else among its siblings. */
function useRowMoves(project: Project, within: 'favourites' | undefined, edges: { first: boolean; last: boolean } | undefined, movable: boolean) {
  const favourites = useFavourites()
  const inFavourites = within === 'favourites'
  const place = inFavourites ? favouriteEdges(favourites, 'project', project.id) : edges ?? { first: true, last: true }
  const move = inFavourites ? (d: -1 | 1) => moveFavourite('project', project.id, d) : movable ? (d: -1 | 1) => moveProjectBy(project.id, d) : undefined
  return { move, ...place }
}

/** The sidebar's menu: the project header's, built only while it is open, then the row's moves. */
function SidebarProjectMenu({ project, within, edges, movable, onRename, className }: {
  project: Project; within?: 'favourites'; edges?: { first: boolean; last: boolean }; movable: boolean; onRename?: () => void; className: string
}) {
  const [open, setOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const userId = useCurrentUserId() ?? undefined
  const menu = useProjectMenu(project, { userId, rename: onRename ?? (() => setRenaming(true)), active: open })
  const { move, first, last } = useRowMoves(project, within, edges, movable)
  return (
    <>
      <ActionMenu label={t('Menu for project {name}', { name: project.name })} title={project.name} groups={[{ items: [menu.shareItem] }, ...menu.groups, ...rowMoveGroups(move, first, last)]}
        header={menu.swatches} width="sm:w-72" open={open} onOpenChange={setOpen}
        triggerClassName={`touch-target rounded-control px-1.5 py-0.5 text-faint hover:bg-sunken dark:hover:bg-raised ${className}`} />
      {menu.dialogs}
      {renaming && menu.editable &&
        <NamePrompt title={t('Rename project')} label={t('Project name')} initial={project.name}
          onSubmit={async (name) => { await renameProject(project, name); setRenaming(false) }} onCancel={() => setRenaming(false)} />}
    </>
  )
}

export function ProjectRowMenu({ project, within, edges, movable = false, appearance = false, onRename, className = '' }: {
  project: Project
  within?: 'favourites'
  /** Its place among its siblings (outside the Favourites group). */
  edges?: { first: boolean; last: boolean }
  /** Whether this user may reorder the project (project-sharing roles). */
  movable?: boolean
  /** The sidebar also offers project metadata editing. */
  appearance?: boolean
  /** The Projects tree edits the row directly. Favourites opens the name dialog. */
  onRename?: () => void
  className?: string
}) {
  if (appearance) return <SidebarProjectMenu project={project} within={within} edges={edges} movable={movable} onRename={onRename} className={className} />
  return <PageProjectMenu project={project} within={within} edges={edges} movable={movable} className={className} />
}

/** The All projects page's menu: Pin to sidebar, the moves, the flow and maintenance. */
function PageProjectMenu({ project, within, edges, movable, className }: {
  project: Project; within?: 'favourites'; edges?: { first: boolean; last: boolean }; movable: boolean; className: string
}) {
  const pinned = useIsFavourite('project', project.id)
  const place = useRowMoves(project, within, edges, movable)
  // "Flow…" (project-flow-modes D7) for the owner and admins; under Simple lists only once a flow is set.
  const membership = useMembership(project.id)
  const mode = useMethodMode()
  const canEdit = membership !== undefined && canEditProject(membership?.role ?? 'owner')
  const flow = projectFlowItem(project, { mode, canEdit })
  // "Put in maintenance" / "End maintenance" (project-review-cadence D6), under the same rule.
  const maintenance = maintenanceItem(project, { mode, canEdit })
  const extra = [flow, maintenance].filter((i) => i !== null)
  const groups = [...projectRowMenuGroups({ pinned, pin: () => setFavourite('project', project.id, !pinned), ...place }), ...(extra.length ? [{ items: extra }] : [])]
  return (
    <ActionMenu label={t('Menu for project {name}', { name: project.name })} title={project.name} groups={groups}
      triggerClassName={`touch-target rounded-control px-1.5 py-0.5 text-faint hover:bg-sunken dark:hover:bg-raised ${className}`} />
  )
}

// A project row's menu in the sidebar, the Favourites group and the All projects page
// (sidebar-favourites D3): "Pin to sidebar", then Move up and Move down. The pin is the
// user's own preference (never a project op); the moves reorder the favourites when
// the menu is opened from the Favourites group, else the project among its siblings,
// which only its owner or an admin may do.
import { favouriteEdges, moveFavourite, setFavourite } from '../lib/favourites'
import { moveProjectBy } from '../lib/move'
import type { Project } from '../lib/types'
import { t } from '../lib/i18n'
import { ActionMenu, type ActionGroup } from './menus/ActionMenu'
import { pinItem } from './menus/pinItem'
import { useFavourites, useIsFavourite } from './useFavourites'

export function projectRowMenuGroups(a: { pinned: boolean; pin: () => unknown; move?: (d: -1 | 1) => unknown; first: boolean; last: boolean }): ActionGroup[] {
  return [
    { items: [pinItem(a.pinned, a.pin)] },
    ...(a.move ? [{ items: [
      { kind: 'action' as const, id: 'up', label: t('Move up'), icon: 'arrow-up' as const, shortcut: 'Alt+↑', disabled: a.first, reason: t('Already first'), onSelect: () => a.move!(-1) },
      { kind: 'action' as const, id: 'down', label: t('Move down'), icon: 'arrow-down' as const, shortcut: 'Alt+↓', disabled: a.last, reason: t('Already last'), onSelect: () => a.move!(1) },
    ] }] : []),
  ]
}

export function ProjectRowMenu({ project, within, edges, movable = false, className = '' }: {
  project: Project
  within?: 'favourites'
  /** Its place among its siblings (outside the Favourites group). */
  edges?: { first: boolean; last: boolean }
  /** Whether this user may reorder the project (project-sharing roles). */
  movable?: boolean
  className?: string
}) {
  const favourites = useFavourites()
  const pinned = useIsFavourite('project', project.id)
  const inFavourites = within === 'favourites'
  const place = inFavourites ? favouriteEdges(favourites, 'project', project.id) : edges ?? { first: true, last: true }
  const move = inFavourites ? (d: -1 | 1) => moveFavourite('project', project.id, d) : movable ? (d: -1 | 1) => moveProjectBy(project.id, d) : undefined
  const groups = projectRowMenuGroups({ pinned, pin: () => setFavourite('project', project.id, !pinned), move, ...place })
  return (
    <ActionMenu label={t('Menu for project {name}', { name: project.name })} title={project.name} groups={groups}
      triggerClassName={`touch-target rounded-control px-1.5 py-0.5 text-faint hover:bg-sunken dark:hover:bg-raised ${className}`} />
  )
}

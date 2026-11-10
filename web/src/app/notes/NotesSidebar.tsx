// The sidebar's Notes space (OpenSpec change notes-space, design D1): under All notes
// (drawn by the sidebar itself), the pinned notes in the favourites order and the few standalone notes changed last.
// A lazy chunk: the first load carries only the switch. Local data only, so it is
// right offline and follows pins and edits from other devices after sync.
import { type KeyboardEvent, useEffect, useMemo, useRef } from 'react'
import { moveFavourite, type Favourite } from '../../lib/favourites'
import { updatedOf } from '../../lib/noteList'
import { useNoteRows } from '../../lib/noteRows'
import { t } from '../../lib/i18n'
import { SidebarGroup, SidebarItem } from '../../ui'
import { act } from '../actionError'
import { NoteFavouriteMenu } from '../FavouritesGroup'
import { navigate, type Route } from '../router'
import { useFavourites } from '../useFavourites'

/** How many recently changed notes the space lists. */
export const RECENT_NOTES = 5

const STANDALONE_FIELDS = ['title', 'notes_doc', 'description', 'labels', 'project_id']
const titleOf = (title: string | undefined) => title?.trim() || t('Untitled note')

export function NotesSidebar({ route, collapsed }: { route: Route; collapsed: boolean }) {
  const favourites = useFavourites()
  const pinned = useMemo(() => favourites.filter((f): f is Extract<Favourite, { kind: 'note' }> => f.kind === 'note'), [favourites])
  const notes = useNoteRows()
  const recent = useMemo(() => {
    const pins = new Set(pinned.map((f) => f.id))
    return notes.filter((n) => !n.deleted_at && !pins.has(n.id))
      .map((n) => ({ n, at: updatedOf(n._clock, STANDALONE_FIELDS) || n.created_at || 0 }))
      .sort((a, b) => b.at - a.at || (a.n.id < b.n.id ? -1 : 1))
      .slice(0, RECENT_NOTES).map((x) => x.n)
  }, [notes, pinned])
  const openId = route.view === 'notes' ? route.id : undefined
  // A moved row is drawn again in its new place: the keyboard focus stays on it.
  const refocus = useRef<string | null>(null)
  useEffect(() => {
    const id = refocus.current
    refocus.current = null
    if (id) document.querySelector<HTMLElement>(`[data-space-note="${CSS.escape(id)}"]`)?.focus()
  }, [pinned])
  const onPinnedKey = (e: KeyboardEvent<HTMLButtonElement>, id: string) => {
    if (!e.altKey || e.ctrlKey || e.metaKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
    e.preventDefault()
    e.stopPropagation()
    refocus.current = id
    act(moveFavourite('note', id, e.key === 'ArrowUp' ? -1 : 1))
  }
  const row = (id: string, title: string | undefined, onKeyDown?: (e: KeyboardEvent<HTMLButtonElement>) => void) => (
    <SidebarItem data-space-note={id} label={titleOf(title)} icon="notebook-pen" active={openId === id} collapsed={collapsed}
      onClick={() => navigate({ view: 'notes', id })} onKeyDown={onKeyDown} />
  )
  return (
    <div data-sidebar-notes>
      {pinned.length > 0 && (
        <SidebarGroup title={t('Pinned')} collapsed={collapsed} testId="sidebar-notes-pinned">
          {pinned.map((f) => (
            <div key={f.id} className="group flex items-center rounded-control">
              {row(f.id, f.item.title, (e) => onPinnedKey(e, f.id))}
              {!collapsed && <NoteFavouriteMenu id={f.id} name={titleOf(f.item.title)} favourites={pinned} className="hover-reveal" />}
            </div>
          ))}
        </SidebarGroup>
      )}
      {recent.length > 0 && (
        <SidebarGroup title={t('Recent')} collapsed={collapsed} testId="sidebar-notes-recent">
          {recent.map((n) => <div key={n.id}>{row(n.id, n.title)}</div>)}
        </SidebarGroup>
      )}
    </div>
  )
}

export default NotesSidebar

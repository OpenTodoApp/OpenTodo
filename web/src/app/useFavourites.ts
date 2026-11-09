// The Favourites group's entries (sidebar-favourites D2), from local data only, so
// pins, order and renames from other devices show after sync and everything works offline.
import { useMemo } from 'react'
import { favouritesOf, isFavourite, type Favourite, type FavouriteKind } from '../lib/favourites'
import { useLabels, usePinnedNoteRows, useProjects, useUserPrefsRow } from '../lib/localData'
import { useViews } from './useViews'

export function useFavourites(): Favourite[] {
  const prefs = useUserPrefsRow()
  const projects = useProjects()
  const labels = useLabels()
  const views = useViews()
  const notes = usePinnedNoteRows()
  return useMemo(() => favouritesOf(prefs, { projects, labels, views, notes }), [prefs, projects, labels, views, notes])
}

/** Whether a project, label or note is pinned (a view reads its own flag). */
export function useIsFavourite(kind: Exclude<FavouriteKind, 'view'>, id: string): boolean {
  const prefs = useUserPrefsRow()
  return isFavourite(prefs, kind, id)
}

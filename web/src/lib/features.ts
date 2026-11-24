// Feature switches per workspace (OpenSpec change workspace-feature-switches,
// design D1, D3). A workspace's `features` map holds `false` for what its owner and
// admins switched off; a missing key, and a workspace without a map, read as on.
// The workspace gates and the person's own switch (Habits, Objectives, maps)
// refines: a feature shows only when both say on. Off only hides; nothing here
// writes or filters data. internal/sync/workspace_features.go lists the same ids.
import { useMemo } from 'react'
import { msg, t } from './i18n'
import { useWorkspaceState } from './localData'
import type { Workspace } from './types'

/** The switchable features, in Settings order. */
export const FEATURES = ['notes', 'calendar', 'habits', 'time-tracking', 'focus', 'routines', 'reviews', 'locations'] as const
export type FeatureId = (typeof FEATURES)[number]

const NAMES: Record<FeatureId, string> = {
  notes: msg('Notes'), calendar: msg('Calendar'), habits: msg('Habits'), 'time-tracking': msg('Time tracking'),
  focus: msg('Focus'), routines: msg('Routines'), reviews: msg('Reviews'), locations: msg('Locations'),
}

/** A feature's name in the interface language. */
export const featureName = (id: FeatureId): string => t(NAMES[id])

/** Whether the workspace allows the feature: anything but an explicit `false` is on. */
export function featureOn(ws: Pick<Workspace, 'features'> | null | undefined, id: FeatureId): boolean {
  return ws?.features?.[id] !== false
}

/** The device's current workspace, live; undefined before the first sync with a server that knows workspaces. */
export function useCurrentWorkspaceRow(): Workspace | undefined {
  const s = useWorkspaceState()
  return s.list.find((w) => w.id === s.current)
}

/** Whether the current workspace allows the feature, live and offline (from the cached directory). */
export function useFeature(id: FeatureId): boolean {
  return featureOn(useCurrentWorkspaceRow(), id)
}

/**
 * The current workspace's answer for every feature, as one function (lists that
 * check several); the same function until a switch changes, so memoised readers stay put.
 */
export function useFeatures(): (id: FeatureId | null | undefined) => boolean {
  const ws = useCurrentWorkspaceRow()
  const off = FEATURES.filter((id) => !featureOn(ws, id)).join(',')
  return useMemo(() => {
    const set = new Set(off.split(','))
    return (id: FeatureId | null | undefined) => !id || !set.has(id)
  }, [off])
}

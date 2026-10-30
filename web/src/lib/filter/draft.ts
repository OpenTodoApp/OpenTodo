// The New view page's draft (OpenSpec change sidebar-polish, design D5; filter-queries
// "New view keeps its draft"): the query and the display options, kept per device and
// workspace in the local `meta` table next to the query history. Never synced or
// exported, and cleared on sign-out with the rest of the local data. The query is
// content, so for an encrypted account it stays on the device like the history.
import { getMeta, setMeta, db } from '../db'

export interface FilterDraft {
  query: string
  group_by: string
  sort_by: string
  sort_dir: string
  layout: string
  show_completed: boolean
  hidden_props: string[]
  /** The row layout chosen on the page; absent follows the account's. */
  row_layout?: string
}

/** The draft's meta key for a workspace ('' before the first sync with a server that knows workspaces). */
export const filterDraftKey = (workspaceId: string): string => `filterDraft:${workspaceId}`

/** A new view's options: the saved view defaults. */
export const EMPTY_DRAFT_OPTIONS = { group_by: 'project', sort_by: 'due', sort_dir: 'asc', layout: 'list', show_completed: false, hidden_props: [] as string[] }

/** True when there is nothing to keep: an empty query with the default options. */
export function isEmptyDraft(d: FilterDraft): boolean {
  return d.query.trim() === '' && d.group_by === EMPTY_DRAFT_OPTIONS.group_by && d.sort_by === EMPTY_DRAFT_OPTIONS.sort_by
    && d.sort_dir === EMPTY_DRAFT_OPTIONS.sort_dir && d.layout === EMPTY_DRAFT_OPTIONS.layout && !d.show_completed
    && d.hidden_props.length === 0 && !d.row_layout
}

/** The stored draft of a workspace, or null. A malformed row reads as none. */
export async function getFilterDraft(workspaceId: string): Promise<FilterDraft | null> {
  const d = await getMeta<FilterDraft | null>(filterDraftKey(workspaceId), null)
  return d && typeof d === 'object' && typeof d.query === 'string' ? { ...EMPTY_DRAFT_OPTIONS, ...d, hidden_props: Array.isArray(d.hidden_props) ? d.hidden_props : [] } : null
}

/** Stores the draft; an empty one is removed, so nothing is kept. */
export async function saveFilterDraft(workspaceId: string, d: FilterDraft): Promise<void> {
  if (isEmptyDraft(d)) await clearFilterDraft(workspaceId)
  else await setMeta(filterDraftKey(workspaceId), d)
}

export async function clearFilterDraft(workspaceId: string): Promise<void> {
  await db.meta.delete(filterDraftKey(workspaceId))
}

# Design

## Context

The task list keeps one `actionsOpen` flag for two menus: the selection bar's menu (shown while `ticked.length > 0`) and the cursor task's menu (shown while `ticked.length === 0`, for `.` or a row's More). A bulk action that removes every ticked row from the list prunes the ticked set while the flag is still on, so the bar's menu unmounts and the cursor menu mounts for the last ticked task with no anchor (`actionsFrom` is null), at the window's left edge. Separately, ticking sets the cursor; once the ticks clear, `useSidePanel` follows the cursor again and docks that task, which has left the list.

## Decisions

### D1. The open menu is held for its target
`useActionsOpen(tickedCount)` (in `bulk/useBulkList.tsx`) stores `'ticked' | 'cursor' | null`, chosen from the ticked count when the menu opens. Each menu renders only while its target still holds, so the other menu never shows for a frame, and an effect closes the stale state. Both `TaskListView` and `useBulkList` use it.

### D2. The panel follows a listed cursor only
`useListSplit` passes the side panel the cursor only while its row is in the list; the Inbox split's own follow checks the same. Nothing else about the cursor changes: Escape after ticking still brings the cursor's task back.

## Data model and sync

None.

## Risks

None known: a menu whose ticked tasks all leave the list now closes, which is what the user expects after the action is done.

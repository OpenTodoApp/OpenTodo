// Display options of a project's list, a label's page and the built-in Today, Upcoming
// and Inbox (OpenSpec changes list-display-options, builtin-view-options): the header's
// display button (D2) and the switch back to manual order a drag or keyboard move makes
// while another order is shown (D4), the `r` sequences that change the same options
// from the keyboard (display-keys), and the built-in views' Reset (builtin-view-options D7).
import { useCallback, type ReactNode } from 'react'
import { DISPLAY_KINDS, isBuiltinScope, isDefaultDisplay, resetListDisplay, setListDisplay, type DisplayScope, type ListDisplay } from '../../lib/listDisplay'
import type { RowLayout } from '../../lib/rowLayout'
import type { FieldDef } from '../../lib/types'
import { act } from '../actionError'
import { DisplayPanel } from '../views/DisplayPanel'
import { useDisplayKeys } from '../views/useDisplayKeys'

export function useListDisplay(display: ListDisplay | undefined, scope: DisplayScope | null, shown: boolean, sortFields: readonly FieldDef[], account: RowLayout): { control: ReactNode; onReorder: () => void } {
  const kind = scope ? DISPLAY_KINDS[scope.kind] : null
  // Only a page with a manual order switches back to it (Today and Upcoming have none).
  const otherOrder = !!display && !!kind?.sorts.includes('position') && !(display.sortBy === 'position' && display.sortDir === 'asc')
  const onReorder = useCallback(() => {
    if (otherOrder && scope) act(setListDisplay(scope, { sortBy: 'position', sortDir: 'asc' }))
  }, [otherOrder, scope])
  const on = display && scope && kind && shown
  const fields = kind?.fields ? sortFields : []
  useDisplayKeys(on ? { value: display, groupOptions: kind.groups, sortOptions: kind.sorts, sortFields: fields, set: (patch) => setListDisplay(scope, patch) } : null)
  const control = on ? (
    <DisplayPanel<ListDisplay> value={display} onChange={(patch) => act(setListDisplay(scope, patch))}
      groupOptions={kind.groups} sortOptions={kind.sorts} sortFields={fields}
      onReset={isBuiltinScope(scope) && !isDefaultDisplay(scope.kind, display, account) ? () => act(resetListDisplay(scope)) : undefined} />
  ) : null
  return { control, onReorder }
}

// Display options of a project's list and a label's page (OpenSpec change
// list-display-options): the header's display button (D2) and the switch back to
// manual order a drag or keyboard move makes while another order is shown (D4), and
// the `r` sequences that change the same options from the keyboard (display-keys).
import { useCallback, type ReactNode } from 'react'
import { LABEL_GROUP_OPTIONS, LIST_SORT_OPTIONS, PROJECT_GROUP_OPTIONS, setListDisplay, type DisplayScope, type ListDisplay } from '../../lib/listDisplay'
import type { FieldDef } from '../../lib/types'
import { act } from '../actionError'
import { DisplayPanel } from '../views/DisplayPanel'
import { useDisplayKeys } from '../views/useDisplayKeys'

export function useListDisplay(display: ListDisplay | undefined, scope: DisplayScope | null, shown: boolean, sortFields: readonly FieldDef[]): { control: ReactNode; onReorder: () => void } {
  const otherOrder = !!display && !(display.sortBy === 'position' && display.sortDir === 'asc')
  const onReorder = useCallback(() => {
    if (otherOrder && scope) act(setListDisplay(scope, { sortBy: 'position', sortDir: 'asc' }))
  }, [otherOrder, scope])
  const groupOptions = scope?.kind === 'project' ? PROJECT_GROUP_OPTIONS : LABEL_GROUP_OPTIONS
  useDisplayKeys(display && scope && shown ? { value: display, groupOptions, sortOptions: LIST_SORT_OPTIONS, sortFields, set: (patch) => setListDisplay(scope, patch) } : null)
  const control = display && scope && shown ? (
    <DisplayPanel<ListDisplay> value={display} onChange={(patch) => act(setListDisplay(scope, patch))}
      groupOptions={groupOptions} sortOptions={LIST_SORT_OPTIONS} sortFields={sortFields} />
  ) : null
  return { control, onReorder }
}

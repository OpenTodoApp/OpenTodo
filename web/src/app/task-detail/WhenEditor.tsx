// The When popover of the panel (OpenSpec change task-panel-facets, design D3): the
// When control under its segment picker, in the facet editor's frame, with what Clear
// does for the shown segment. Loaded on first use (when-picker), so the When editor
// stays out of the app's first load; the row's Schedule popover and the edit bar's
// Date load it the same way.
import type { RefObject } from 'react'
import type { WhenSegmentId } from '../../lib/facets'
import { setRecurrence, unparkTask, updateTask } from '../../lib/ops'
import type { Task } from '../../lib/types'
import { t } from '../../lib/i18n'
import { act } from '../actionError'
import { setDueWithUndo } from '../undoable'
import { FacetEditor } from './FacetEditor'
import { setSectorWithUndo } from './SectorChoice'
import { useSectorSegment, WhenControl, WhenSegmentPicker } from './WhenControl'

export default function WhenEditor({ task, readOnly, anchor, segment, onSegment, onClose, onOpen, onAddLocation }: {
  task: Task
  readOnly: boolean
  anchor: RefObject<HTMLElement | null>
  segment: WhenSegmentId
  onSegment: (s: WhenSegmentId) => void
  onClose: () => void
  onOpen?: (id: string) => void
  onAddLocation: () => void
}) {
  const sector = useSectorSegment(task)
  const clear: Partial<Record<WhenSegmentId, () => void>> = {
    due: task.due ? () => act(setDueWithUndo(task.id, null)) : undefined,
    start: task.start ? () => void unparkTask(task.id) : undefined,
    deadline: task.deadline ? () => act(updateTask(task.id, { deadline: null })) : undefined,
    repeat: task.recurrence ? () => act(setRecurrence(task.id, null)) : undefined,
    sector: task.sector ? () => act(setSectorWithUndo(task.id, '')) : undefined,
  }
  return (
    <FacetEditor anchor={anchor} icon="calendar-days" title={t('When')} onClose={onClose} onClear={clear[segment]}
      header={<WhenSegmentPicker value={segment} onChange={onSegment} sector={sector} />} width="sm:w-[28rem]">
      <WhenControl task={task} readOnly={readOnly} segment={segment} onOpen={onOpen} onClose={onClose} onAddLocation={onAddLocation} />
    </FacetEditor>
  )
}

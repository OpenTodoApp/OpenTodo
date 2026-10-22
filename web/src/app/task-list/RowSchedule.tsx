// The row's Schedule popover (OpenSpec change rows-v2, task-list-presentation
// "Revealed row actions"): the panel's own Do on editor anchored to the row's
// Schedule button, as the inline edit bar's Date opens it. Loaded on first use, so
// the When editor stays out of the list's first paint.
import type { RefObject } from 'react'
import type { Task } from '../../lib/types'
import { t } from '../../lib/i18n'
import { FacetEditor } from '../task-detail/FacetEditor'
import { WhenControl } from '../task-detail/WhenControl'

export default function RowSchedule({ task, anchor, onClose }: { task: Task; anchor: RefObject<HTMLButtonElement | null>; onClose: () => void }) {
  return (
    <FacetEditor anchor={anchor} icon="calendar-days" title={t('Do on')} onClose={onClose} width="sm:w-[28rem]">
      <WhenControl task={task} segment="due" />
    </FacetEditor>
  )
}

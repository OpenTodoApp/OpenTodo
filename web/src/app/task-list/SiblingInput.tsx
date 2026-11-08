// The inline "Add task below" line after a row and its subtasks (OpenSpec change
// add-below, GitHub issue 1036): each entry lands right after the previous one, a
// sibling of `anchor`, and the list moves the line under it (belowLine.ts). Loaded
// when the line first opens.
import { createTaskAfter } from '../../lib/createAfter'
import { t } from '../../lib/i18n'
import type { Task } from '../../lib/types'
import { AddLine } from './TaskListRow'

export default function SiblingInput({ anchor, after, depth, onAdded, onClose }: { anchor: Task; after: string; depth: number; onAdded: (anchor: string, id: string) => void; onClose: () => void }) {
  return <AddLine depth={depth} onClose={onClose} label={t('Add task below')} add={async (title) => onAdded(anchor.id, await createTaskAfter(anchor, after, title))}
    placeholder={anchor.title ? t('Add a task below {title}…', { title: anchor.title }) : t('Add a task below this one…')} />
}

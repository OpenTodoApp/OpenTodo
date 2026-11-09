// One row of the `[[` link picker (OpenSpec change note-links, design D3): the
// item's icon and title, then a faint second line (its project, or a subtask's
// parent); a done task or an archived project reads muted. Lazy chunk only.
import type { LinkKind } from '../lib/noteLinkGrammar'
import type { LinkCandidate } from '../lib/linkPicker'
import { t } from '../lib/i18n'
import { Icon, type IconName } from '../ui'

export const LINK_ICON: Record<LinkKind, IconName> = { note: 'notebook-pen', task: 'circle-check-big', project: 'folder' }

export function linkGroupLabel(kind: LinkKind): string {
  return kind === 'note' ? t('Notes') : kind === 'task' ? t('Tasks') : t('Projects')
}

export function LinkOption({ c }: { c: LinkCandidate }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2" data-link-option={c.kind}>
      <Icon name={LINK_ICON[c.kind]} size="sm" className="shrink-0 text-muted" />
      <span className={`user-text min-w-0 truncate ${c.done ? 'text-muted line-through' : ''}`}>{c.title}</span>
      {c.secondary && <span className="user-text ml-auto min-w-0 max-w-[45%] shrink truncate text-meta text-faint">{c.secondary}</span>}
    </span>
  )
}

// A note in an answer (OpenSpec change assistant-generative-ui, spec "Note and
// project blocks"): its title and the start of its text rendered as Markdown, cut
// to 12 lines, with Open note. Read-only; lazy chunk.
import type { AssistantBlock } from '../../../lib/assistantBlocks'
import { useBlockNote } from '../../../lib/assistantBlockData'
import { t } from '../../../lib/i18n'
import { Icon } from '../../../ui'
import { Markdown } from '../../Markdown'
import { navigate } from '../../router'

export default function NoteBlock({ block }: { block: Extract<AssistantBlock, { kind: 'note' }> }) {
  const n = useBlockNote(block.id)
  if (n === undefined) return null
  if (!n) return <p className="p-3 text-meta text-muted">{t('Removed')}</p>
  return (
    <div className="space-y-1 p-3" data-assistant-note>
      <p className="flex items-center gap-1.5 text-body font-semibold user-text"><Icon name="notebook-pen" size="sm" className="text-muted" />{n.title.trim() || t('Untitled note')}</p>
      {n.description && <div className="line-clamp-12 text-body"><Markdown source={n.description} /></div>}
      <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm -ml-2 gap-1" onClick={() => navigate({ view: 'notes', id: n.id })}>
        <Icon name="arrow-right" size="sm" />{t('Open note')}
      </button>
    </div>
  )
}

// A project's outline in an answer (OpenSpec change assistant-generative-ui, spec
// "Note and project blocks"): the name, its sections and the open tasks in each,
// with Open project. Read-only; lazy chunk.
import type { AssistantBlock } from '../../../lib/assistantBlocks'
import { useProjectOutline } from '../../../lib/assistantBlockData'
import { t } from '../../../lib/i18n'
import { Icon } from '../../../ui'
import { navigate } from '../../router'

export default function ProjectBlock({ block }: { block: Extract<AssistantBlock, { kind: 'project' }> }) {
  const outline = useProjectOutline(block.id)
  if (!outline) return null
  if (!outline.project) return <p className="p-3 text-meta text-muted">{t('Removed')}</p>
  return (
    <div className="space-y-1 p-3" data-assistant-project>
      <p className="flex items-center gap-1.5 text-body font-semibold user-text"><Icon name="folder" size="sm" className="text-muted" />{outline.project.name}</p>
      <ul className="space-y-0.5 pl-6">
        {outline.sections.map((s) => (
          <li key={s.id ?? '-'} className="flex items-baseline gap-2 text-body" data-outline-section>
            <span className="min-w-0 flex-1 user-text">{s.name}</span>
            <span className="text-meta text-muted">{t('{n, plural, one {# open} other {# open}}', { n: s.open })}</span>
          </li>
        ))}
      </ul>
      <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm -ml-2 gap-1" onClick={() => navigate({ view: 'project', id: block.id })}>
        <Icon name="arrow-right" size="sm" />{t('Open project')}
      </button>
    </div>
  )
}

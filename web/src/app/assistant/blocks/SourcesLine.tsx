// What a read tool returned, in place in the answer (OpenSpec change
// assistant-tool-sources D3): one quiet line, closed by default, that opens to
// the rows from the device. Lazy chunk, like the blocks.
import type { AssistantSource } from '../../../lib/assistantSources'
import { useSourceRows } from '../../../lib/assistantBlockData'
import { t } from '../../../lib/i18n'
import { Icon } from '../../../ui'
import { openTaskPanel } from '../../panel'
import { navigate } from '../../router'

export function sourceLabel(s: AssistantSource): string {
  if (s.of === 'projects') return s.total ? t('{n, plural, one {Looked at # project} other {Looked at # projects}}', { n: s.total }) : t('No projects found')
  return s.total ? t('{n, plural, one {Looked at # task} other {Looked at # tasks}}', { n: s.total }) : t('No tasks found')
}

function Rows({ source }: { source: AssistantSource }) {
  const rows = useSourceRows(source)
  if (!rows) return null
  const open = (id: string) => (source.of === 'projects' ? navigate({ view: 'project', id }) : openTaskPanel(id))
  const more = source.total - source.ids.length
  return (
    <ul className="mt-1 space-y-0.5 pl-5">
      {rows.map((r, i) => (
        <li key={source.ids[i]}>
          {r
            ? <button type="button" className="min-w-0 text-left text-default underline decoration-dotted underline-offset-2 user-text" onClick={() => open(r.id)}>{r.name || t('Untitled')}</button>
            : <span>{t('Removed')}</span>}
        </li>
      ))}
      {more > 0 && <li>{t('and {n} more', { n: more })}</li>}
    </ul>
  )
}

export default function SourcesLine({ source }: { source: AssistantSource }) {
  const label = (
    <span className="inline-flex items-center gap-1.5 align-top"><Icon name="search" size="sm" />{sourceLabel(source)}</span>
  )
  if (!source.ids.length) return <p className="my-1 text-meta text-muted" data-assistant-source={source.of}>{label}</p>
  return (
    <details className="my-1 text-meta text-muted" data-assistant-source={source.of}>
      <summary className="w-fit cursor-pointer rounded-control">{label}</summary>
      <Rows source={source} />
    </details>
  )
}

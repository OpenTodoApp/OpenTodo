// Tracked time in an answer (OpenSpec change assistant-time-blocks, spec "Time
// block"): the user's own time on the block's days as bars per project or per day,
// each with its total, and the overall total, from this device's entries. Each bar
// opens Statistics. Read-only; lazy chunk.
import type { AssistantBlock } from '../../../lib/assistantBlocks'
import { useTrackedTime } from '../../../lib/assistantBlockData'
import { formatMinutes } from '../../../lib/duration'
import { t } from '../../../lib/i18n'
import { navigate } from '../../router'

export default function TimeBlock({ block }: { block: Extract<AssistantBlock, { kind: 'time' }> }) {
  const time = useTrackedTime(block)
  if (!time) return null
  if (time.total === 0) return <p className="p-3 text-meta text-muted" data-assistant-time>{t('No time tracked on these days.')}</p>
  const max = Math.max(1, ...time.groups.map((g) => g.minutes))
  return (
    <div className="p-3" data-assistant-time>
      <ul className="space-y-0.5">
        {time.groups.map((g) => (
          <li key={g.key} data-time-group={g.key}>
            <button type="button" className="grid min-h-9 w-full grid-cols-[minmax(0,8rem)_1fr] items-center gap-3 rounded-control px-1.5 text-left hover:bg-hover"
              onClick={() => navigate({ view: 'stats' })}>
              <span className={`truncate text-body ${block.group_by === 'project' && g.key ? 'user-text' : ''}`}>{g.label}</span>
              <span className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 flex-1" aria-hidden="true">
                  <span className="block h-2.5 rounded-full bg-chart-base" style={{ width: `${g.minutes ? Math.max(3, (g.minutes / max) * 100) : 0}%` }} />
                </span>
                <span className="w-14 shrink-0 whitespace-nowrap text-right text-meta tabular-nums text-muted">{g.minutes ? formatMinutes(g.minutes) : '–'}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 flex items-baseline justify-between border-t border-default px-1.5 pt-2 text-body" data-time-total>
        <span className="text-muted">{t('Total')}</span>
        <span className="font-semibold tabular-nums">{formatMinutes(time.total)}</span>
      </p>
    </div>
  )
}

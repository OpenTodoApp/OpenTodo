// A habit in an answer (OpenSpec change assistant-project-blocks, spec "Project view
// blocks"): its title and current streak, as task rows show it, and the habit's
// month grid (HabitHistory, read-only already), from the series and its records on
// this device. Lazy chunk.
import { useMemo } from 'react'
import type { AssistantBlock } from '../../../lib/assistantBlocks'
import { useBlockHabit } from '../../../lib/assistantBlockData'
import { logicalToday } from '../../../lib/dates'
import { habitStats, streakLabel } from '../../../lib/habits'
import { t } from '../../../lib/i18n'
import { Icon, ToneText } from '../../../ui'
import { HabitHistory } from '../../HabitHistory'
import { openTaskPanel } from '../../panel'

export default function HabitBlock({ block }: { block: Extract<AssistantBlock, { kind: 'habit' }> }) {
  const data = useBlockHabit(block.id)
  const today = logicalToday()
  const stats = useMemo(() => (data?.series ? habitStats(data.series, data.records, today) : null), [data, today])
  if (!data) return null
  const series = data.series
  if (!series) return <p className="p-3 text-meta text-muted">{t('Removed')}</p>
  return (
    <div className="space-y-2 p-3" data-assistant-habit>
      <p className="flex min-w-0 items-center gap-2">
        <Icon name="repeat" size="sm" className="shrink-0 text-muted" />
        <span className="min-w-0 flex-1 truncate text-body font-semibold user-text">{series.title || t('Untitled')}</span>
        {stats && (
          <ToneText icon="flame" tone={stats.overdue ? 'warning' : 'default'} className="shrink-0" data-testid="habit-streak" label={streakLabel(stats)}>
            {t('{n, plural, one {# day} other {# days}}', { n: stats.current })}
          </ToneText>
        )}
      </p>
      <HabitHistory series={series} records={data.records} today={today} />
      <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm -ml-2 gap-1" onClick={() => openTaskPanel(series.id)}>
        <Icon name="arrow-right" size="sm" />{t('Open task')}
      </button>
    </div>
  )
}

// Statistics in an answer (OpenSpec change assistant-project-blocks, spec "Project
// view blocks"): the statistics screen's number tiles for the block's days (done,
// counted as Statistics counts it) and for now (overdue, the Inbox, Today against
// the Today limit), computed on this device. Read-only; lazy chunk.
import type { AssistantBlock } from '../../../lib/assistantBlocks'
import { useBlockStats } from '../../../lib/assistantBlockData'
import { logicalToday } from '../../../lib/dates'
import { t } from '../../../lib/i18n'
import { StatTile } from '../../review/charts'

export default function StatsBlock({ block }: { block: Extract<AssistantBlock, { kind: 'stats' }> }) {
  const s = useBlockStats(block, logicalToday())
  if (!s) return null
  return (
    <dl className="grid grid-cols-2 gap-2 p-3" data-assistant-stats>
      <StatTile testId="done" label={t('Done')} value={String(s.completed)} />
      <StatTile testId="earlier" label={t('Earlier')} value={String(s.overdue)} />
      <StatTile testId="inbox" label={t('Inbox')} value={String(s.inbox)} />
      <StatTile testId="today" label={t('Today')} value={s.limit ? t('{done} of {total}', { done: s.today, total: s.limit }) : String(s.today)} />
    </dl>
  )
}

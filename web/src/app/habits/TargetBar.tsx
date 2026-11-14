// A target habit's thread (OpenSpec change habit-targets, design D5): the current
// week or month as one bar in as many parts as the target, filled for each
// check-in, after the earlier periods as met (filled) or not met (an empty ring).
// Shape tells them apart as well as colour; the group reads "This week, 2 of 3".
import type { TargetThread } from '../../lib/habitTargets'
import { t } from '../../lib/i18n'

const STEP = 24
const R = 5
const PART = 10

export function TargetBar({ thread }: { thread: TargetThread }) {
  const { period, target, count, past } = thread
  const week = period === 'week'
  const now = week ? t('This week, {count} of {target}', { count, target }) : t('This month, {count} of {target}', { count, target })
  const shown = Math.min(target, 7)
  const filled = Math.min(count, target) * (shown / target)
  const barX = past.length * STEP + 4
  const barW = shown * PART + (shown - 1) * 2
  const width = barX + barW
  return (
    <div role="img" aria-label={past.length ? `${now}. ${t('Earlier: {list}', { list: past.map((m) => (m ? t('met') : t('not met'))).join(', ') })}` : now}
      className="relative shrink-0" style={{ width: Math.max(width, STEP * 7), height: STEP }} data-thread data-target-bar={`${count}/${target}`}>
      <svg width={width} height={STEP} viewBox={`0 0 ${width} ${STEP}`} aria-hidden="true" className="absolute inset-0 overflow-visible">
        {past.map((met, i) => met
          ? <circle key={i} cx={STEP / 2 + i * STEP} cy={STEP / 2} r={R} className="fill-hue-solid" data-period="met" />
          : <circle key={i} cx={STEP / 2 + i * STEP} cy={STEP / 2} r={R - 0.75} fill="none" strokeWidth={1.5} className="stroke-(--border-color-strong)" data-period="missed" />)}
        {Array.from({ length: shown }, (_, i) => (
          <rect key={i} x={barX + i * (PART + 2)} y={STEP / 2 - 4} width={PART} height={8} rx={2} strokeWidth={1.5}
            className={i < Math.round(filled) ? 'fill-hue-solid stroke-hue-solid' : 'fill-none stroke-hue-solid'} data-part={i < Math.round(filled) ? 'done' : 'open'} />
        ))}
      </svg>
    </div>
  )
}

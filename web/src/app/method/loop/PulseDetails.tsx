// The full Loop pulse behind the pulse line (loop-guided-dashboard D6; open-loops
// "Loop pulse"): four figures about the last 14 days, from the statistics
// definitions, the 14-day strip with its text alternative and Statistics, in a
// popover (a sheet below 640 px).
import type { RefObject } from 'react'
import { formatDate } from '../../../lib/dates'
import { t } from '../../../lib/i18n'
import { INBOX_AGE_CAUTION_DAYS, PULSE_DAYS } from '../../../lib/method/pulse'
import { Button, Popover, Tooltip } from '../../../ui'
import { useDateTimeFormat } from '../../DateTimePrefsProvider'
import { navigate } from '../../router'
import type { PulseData } from '../LoopHome'

export default function PulseDetails({ pulse, anchor, onClose }: { pulse: PulseData; anchor: RefObject<HTMLButtonElement | null>; onClose: () => void }) {
  const dt = useDateTimeFormat().resolved
  const delta = pulse.week - pulse.lastWeek
  const max = Math.max(1, ...pulse.days.map((d) => d.count))
  const pct = pulse.caught ? Math.round((100 * pulse.decided) / pulse.caught) : 0
  const stale = pulse.age !== null && pulse.age > INBOX_AGE_CAUTION_DAYS
  const figure = 'flex min-w-0 flex-col gap-0.5 rounded-card bg-sunken px-3 py-2.5'
  const label = 'break-words text-hint font-semibold uppercase tracking-wide text-muted'
  const value = 'flex items-baseline gap-1.5 text-h2 font-semibold tabular-nums text-strong'
  return (
    <Popover open onClose={onClose} anchor={anchor} label={t('Loop pulse · last {n} days', { n: PULSE_DAYS })} align="start" width="sm:w-[26rem]" className="p-3">
      <div data-loop-pulse>
        <p className="mb-2 hidden px-1 text-meta font-semibold text-faint sm:block">{t('Loop pulse · last {n} days', { n: PULSE_DAYS })}</p>
        <div className="grid grid-cols-2 gap-2">
          <div className={figure} data-pulse="week">
            <span className={label}>{t('Done this week')}</span>
            <span className={value}>{pulse.week}<span className="text-meta font-normal text-muted">{t('{n, plural, one {task} other {tasks}}', { n: pulse.week })}</span></span>
            <span className={`break-words text-meta ${delta < 0 ? 'text-on-warning-soft' : 'text-on-success-soft'}`}>{t('{n} vs last week', { n: delta > 0 ? `+${delta}` : String(delta) })}</span>
          </div>
          <div className={figure} data-pulse="decided">
            <span className={label}>{t('Caught, decided')}</span>
            <span className={value}>{pulse.decided}<span className="text-meta font-normal text-muted">{t('of {n}', { n: pulse.caught })}</span></span>
            <span className="break-words text-meta text-muted">{t('{pct}% left the Inbox', { pct })}</span>
          </div>
          <div className={figure} data-pulse="age">
            <span className={label}>{t('Oldest in Inbox')}</span>
            <span className={value}>
              {pulse.age === null ? <span className="text-body font-semibold text-success">{t('empty')}</span>
                : <>{pulse.age}<span className="text-meta font-normal text-muted">{t('{n, plural, one {day} other {days}}', { n: pulse.age })}</span></>}
            </span>
            <span className={`break-words text-meta ${stale ? 'text-on-warning-soft' : 'text-muted'}`}>{pulse.age === null ? t('nothing waiting') : stale ? t('older than a week') : t('within the week')}</span>
          </div>
          <div className={figure} data-pulse="strip">
            <span className={label}>{t('Completed per day')}</span>
            <div className="flex h-10 items-end gap-0.5" aria-hidden="true">
              {pulse.days.map((d) => (
                <Tooltip key={d.date} label={`${formatDate(d.date, 'compact', dt)}: ${d.count}`}>
                  <span tabIndex={-1} className={`block min-w-0 flex-1 rounded-chip ${d.count ? 'bg-accent' : 'bg-(--ot-border)'}`} style={{ height: `${Math.max(6, Math.round((100 * d.count) / max))}%` }} />
                </Tooltip>
              ))}
            </div>
            <span className="flex justify-between text-hint tabular-nums text-faint" aria-hidden="true">
              <span>{formatDate(pulse.days[0].date, 'compact', dt)}</span><span className="text-muted">{t('{n} this week', { n: pulse.week })}</span><span>{t('today')}</span>
            </span>
            <ul className="sr-only" aria-label={t('Completed per day, last {n} days', { n: PULSE_DAYS })} data-loop-strip-values>
              {pulse.days.map((d) => <li key={d.date}>{t('{date}: {n, plural, one {# task} other {# tasks}}', { date: formatDate(d.date, 'long', dt), n: d.count })}</li>)}
            </ul>
          </div>
        </div>
        <Button size="sm" variant="ghost" iconEnd="arrow-right" className="mt-2" onClick={() => { onClose(); navigate({ view: 'stats' }) }}>{t('Statistics')}</Button>
      </div>
    </Popover>
  )
}

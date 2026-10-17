// Settings → General → Date and time (OpenSpec date-time-preferences, design D8):
// the three synced preferences with a live preview. A change is an op on the
// user's personal `user_prefs` row, so it applies at once, offline too, and
// reaches the user's other devices with the next sync.
import { useMemo } from 'react'
import { addDaysISO, formatDate, formatInstant, formatTime, resolveDateTime, systemDateTime, todayISO, weekDays, type ResolvedDateTime, dateLocaleOf } from '../lib/dates'
import { DATE_FORMATS, setUserPref, TIME_FORMATS, WEEK_STARTS, type DateTimePrefs } from '../lib/userPrefs'
import type { DateFormatPref, TimeFormatPref, WeekStartPref } from '../lib/types'
import { Select } from '../ui'
import { SettingRow, SettingsSection } from '../ui'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { t, msg, translatedMap } from '../lib/i18n'
import { act } from './actionError'

const DATE_NAMES = translatedMap<DateFormatPref>({ system: msg('System'), 'day-month': msg('Day-month'), 'month-day': msg('Month-day'), iso: 'ISO' })
const TIME_NAMES = translatedMap<TimeFormatPref>({ system: msg('System'), '12h': msg('12-hour'), '24h': msg('24-hour') })
const WEEK_NAMES = translatedMap<WeekStartPref>({ system: msg('System'), mon: msg('Monday'), sun: msg('Sunday'), sat: msg('Saturday') })
const DEFAULTS: DateTimePrefs = { date_format: 'system', time_format: 'system', week_start: 'system' }

export function DateTimeSection() {
  const { prefs, resolved } = useDateTimeFormat()
  return <DateTimeView prefs={prefs ?? DEFAULTS} resolved={resolved} onChange={(field, value) => act(setUserPref(field, value as never))} />
}

export interface DateTimeViewProps {
  prefs: DateTimePrefs
  /** The preferences as they apply now (system values filled in). */
  resolved: ResolvedDateTime
  onChange: <K extends keyof DateTimePrefs>(field: K, value: DateTimePrefs[K]) => void
  /** Reference date for the labels and the preview (tests and stories). */
  today?: string
}

/** Presentational part of the panel, rendered without effects for tests and stories. */
export function DateTimeView({ prefs, resolved, onChange, today = todayISO() }: DateTimeViewProps) {
  const sys = systemDateTime()
  // Each option shows what it looks like with today's date (or a sample time).
  const sample = (p: Partial<DateTimePrefs>) => resolveDateTime({ ...DEFAULTS, ...p }, sys)
  const weekdayName = (start: number) => new Intl.DateTimeFormat(dateLocaleOf(), { weekday: 'long' }).format(new Date(2026, 9, 11 + start))
  const preview = useMemo(() => {
    const at3pm = new Date(`${today}T15:00:00`).getTime()
    return {
      compact: formatDate(addDaysISO(today, 20), 'compact', resolved, today),
      numeric: formatDate(today, 'numeric', resolved, today),
      due: formatTime('15:00', resolved),
      stamp: formatInstant(at3pm, 'time', resolved, today),
      week: weekDays(today, resolved),
    }
  }, [resolved, today])

  return (
    <SettingsSection title={t('Date and time')} headingId="date-time-heading"
      description={t('How dates and times look and where weeks start, on all your devices. System follows this browser.')}>
      <SettingRow label={t('Date format')} htmlFor="date-format-select" control={
        <Select id="date-format-select" className="sm:w-56" value={prefs.date_format} onChange={(e) => onChange('date_format', e.target.value as DateFormatPref)}>
          {DATE_FORMATS.map((f) => <option key={f} value={f}>{`${DATE_NAMES[f]} (${formatDate(today, 'numeric', sample({ date_format: f }), today)})`}</option>)}
        </Select>
      } />
      <SettingRow label={t('Time format')} htmlFor="time-format-select" control={
        <Select id="time-format-select" className="sm:w-56" value={prefs.time_format} onChange={(e) => onChange('time_format', e.target.value as TimeFormatPref)}>
          {TIME_FORMATS.map((f) => <option key={f} value={f}>{f === 'system' ? t('System (as this browser)') : `${TIME_NAMES[f]} (${formatTime('15:00', sample({ time_format: f }))})`}</option>)}
        </Select>
      } />
      <SettingRow label={t('First day of the week')} htmlFor="week-start-select" control={
        <Select id="week-start-select" className="sm:w-56" value={prefs.week_start} onChange={(e) => onChange('week_start', e.target.value as WeekStartPref)}>
          {WEEK_STARTS.map((f) => <option key={f} value={f}>{f === 'system' ? t('System ({weekdayName})', { weekdayName: weekdayName(sys.weekStart) }) : WEEK_NAMES[f]}</option>)}
        </Select>
      } />
      <SettingRow label={t('Preview')} control={
        <div data-testid="date-time-preview" aria-live="polite" className="flex min-w-0 flex-col gap-2 sm:items-end">
          <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-meta">
            <dt className="text-muted">{t('Due date')}</dt><dd className="text-default" data-testid="preview-compact">{preview.compact}</dd>
            <dt className="text-muted">{t('Date')}</dt><dd className="text-default" data-testid="preview-numeric">{preview.numeric}</dd>
            <dt className="text-muted">{t('Due time')}</dt><dd className="text-default" data-testid="preview-time">{preview.due}</dd>
            <dt className="text-muted">{t('Comment time')}</dt><dd className="text-default" data-testid="preview-stamp">{preview.stamp}</dd>
          </dl>
          <ol aria-label={t('This week')} data-testid="preview-week" className="flex gap-1">
            {preview.week.map((iso) => (
              <li key={iso} aria-current={iso === today ? 'date' : undefined}
                className={`flex w-9 flex-col items-center rounded-control py-1 text-meta ${iso === today ? 'bg-accent text-on-accent' : 'bg-sunken text-default'}`}>
                <span className="text-hint uppercase">{new Intl.DateTimeFormat(dateLocaleOf(), { weekday: 'narrow' }).format(new Date(`${iso}T12:00:00`))}</span>
                <span className="font-medium">{Number(iso.slice(8))}</span>
              </li>
            ))}
          </ol>
        </div>
      } />
    </SettingsSection>
  )
}

// Settings → General → Date and time (OpenSpec date-time-preferences, design D8):
// the synced preferences with a live preview (the day start: day-boundary D7). A change is an op on the
// user's personal `user_prefs` row, so it applies at once, offline too, and
// reaches the user's other devices with the next sync.
import { useMemo } from 'react'
import { addDaysISO, formatDate, formatInstant, formatTime, resolveDateTime, systemDateTime, logicalToday, weekDays, type ResolvedDateTime, dateLocaleOf } from '../lib/dates'
import { DATE_FORMATS, DAY_STARTS, setUserPref, TIME_FORMATS, WEEK_STARTS, type DateTimePrefs, type DayStartPref } from '../lib/userPrefs'
import type { DateFormatPref, TimeFormatPref, WeekStartPref } from '../lib/types'
import { Select } from '../ui'
import { SettingRow, SettingsSection } from '../ui'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { useToday } from './useViews'
import { t, msg, translatedMap } from '../lib/i18n'
import { act } from './actionError'
import { cardCopy, rowCopy } from '../lib/settingsCopy'

const DATE_NAMES = translatedMap<DateFormatPref>({ system: msg('System'), 'day-month': msg('Day-month'), 'month-day': msg('Month-day'), iso: 'ISO' })
const TIME_NAMES = translatedMap<TimeFormatPref>({ system: msg('System'), '12h': msg('12-hour'), '24h': msg('24-hour') })
const WEEK_NAMES = translatedMap<WeekStartPref>({ system: msg('System'), mon: msg('Monday'), sun: msg('Sunday'), sat: msg('Saturday') })
const DEFAULTS: DateTimePrefs = { date_format: 'system', time_format: 'system', week_start: 'system' }

/** Minutes after midnight as the stored `HH:MM`. */
const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

export function DateTimeSection() {
  const { prefs, resolved, dayStart } = useDateTimeFormat()
  // The logical today, re-read at the day start and when the preference changes (useToday).
  const today = useToday()
  return <DateTimeView prefs={prefs ?? DEFAULTS} resolved={resolved} today={today} dayStart={dayStart}
    onChange={(field, value) => act(setUserPref(field, value as never))}
    onDayStartChange={(value) => act(setUserPref('day_start', value))} />
}

export interface DateTimeViewProps {
  prefs: DateTimePrefs
  /** The preferences as they apply now (system values filled in). */
  resolved: ResolvedDateTime
  onChange: <K extends keyof DateTimePrefs>(field: K, value: DateTimePrefs[K]) => void
  /** Reference date for the labels and the preview: the logical today (tests and stories pass one). */
  today?: string
  /** The day start in minutes after midnight (day-boundary D7); 0 is midnight. */
  dayStart?: number
  onDayStartChange?: (value: DayStartPref) => void
}

/** Presentational part of the panel, rendered without effects for tests and stories. */
export function DateTimeView({ prefs, resolved, onChange, today = logicalToday(), dayStart = 0, onDayStartChange }: DateTimeViewProps) {
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
      today: formatDate(today, 'full', resolved, today),
    }
  }, [resolved, today])

  return (
    <SettingsSection {...cardCopy('date-time')}>
      <SettingRow {...rowCopy('date-time', 'dateFormat')} htmlFor="date-format-select" control={
        <Select id="date-format-select" className="sm:w-56" value={prefs.date_format} onChange={(e) => onChange('date_format', e.target.value as DateFormatPref)}>
          {DATE_FORMATS.map((f) => <option key={f} value={f}>{`${DATE_NAMES[f]} (${formatDate(today, 'numeric', sample({ date_format: f }), today)})`}</option>)}
        </Select>
      } />
      <SettingRow {...rowCopy('date-time', 'timeFormat')} htmlFor="time-format-select" control={
        <Select id="time-format-select" className="sm:w-56" value={prefs.time_format} onChange={(e) => onChange('time_format', e.target.value as TimeFormatPref)}>
          {TIME_FORMATS.map((f) => <option key={f} value={f}>{f === 'system' ? t('System (as this browser)') : `${TIME_NAMES[f]} (${formatTime('15:00', sample({ time_format: f }))})`}</option>)}
        </Select>
      } />
      <SettingRow {...rowCopy('date-time', 'weekStart')} htmlFor="week-start-select" control={
        <Select id="week-start-select" className="sm:w-56" value={prefs.week_start} onChange={(e) => onChange('week_start', e.target.value as WeekStartPref)}>
          {WEEK_STARTS.map((f) => <option key={f} value={f}>{f === 'system' ? t('System ({weekdayName})', { weekdayName: weekdayName(sys.weekStart) }) : WEEK_NAMES[f]}</option>)}
        </Select>
      } />
      <SettingRow {...rowCopy('date-time', 'dayStart')} htmlFor="day-start-select" control={
        <Select id="day-start-select" className="sm:w-56" value={hhmm(dayStart)} onChange={(e) => onDayStartChange?.(e.target.value as DayStartPref)}>
          {/* A value with minutes from a newer client is shown as it is, so the select never misstates it. */}
          {(DAY_STARTS as readonly string[]).includes(hhmm(dayStart)) ? null : <option value={hhmm(dayStart)}>{formatTime(hhmm(dayStart), resolved)}</option>}
          {DAY_STARTS.map((v) => <option key={v} value={v}>{v === '00:00' ? t('Midnight (default)') : formatTime(v, resolved)}</option>)}
        </Select>
      } />
      <SettingRow {...rowCopy('date-time', 'preview')} control={
        <div data-testid="date-time-preview" aria-live="polite" className="flex min-w-0 flex-col gap-2 sm:items-end">
          <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-meta">
            <dt className="text-muted">{t('Today')}</dt><dd className="text-default" data-testid="preview-today">{preview.today}</dd>
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

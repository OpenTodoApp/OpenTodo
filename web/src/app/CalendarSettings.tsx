import { saveGridPrefs } from '../lib/localData'
import { keysOf } from '../lib/shortcuts'
import { Kbd } from './shortcuts/Kbd'
import { type GridPrefs } from '../lib/calendar'
import { formatMinutes } from '../lib/duration'
import { Select } from '../ui'
import { SettingRow, SettingsSection } from '../ui'
import { useGridPrefs } from './CalendarView'
import { t } from '../lib/i18n'

const HOURS = Array.from({ length: 25 }, (_, h) => h)
const DAY_LENGTHS = [240, 300, 360, 420, 480, 540, 600, 720]
const hour = (h: number) => `${String(h).padStart(2, '0')}:00`

/** Day and Week view preferences (OpenSpec `time-blocking`, design D7): this device only, never synced. */
export function CalendarSettingsSection() {
  const prefs = useGridPrefs()
  return <CalendarSettingsView prefs={prefs} onSave={(patch) => void saveGridPrefs({ ...prefs, ...patch })} />
}

export function CalendarSettingsView({ prefs, onSave }: { prefs: GridPrefs; onSave: (patch: Partial<GridPrefs>) => void }) {
  const lengths = DAY_LENGTHS.includes(prefs.dayLength) ? DAY_LENGTHS : [...DAY_LENGTHS, prefs.dayLength].sort((a, b) => a - b)
  return (
    <SettingsSection title={t('Calendar')} headingId="calendar-heading" description={
      <>{t.rich('Working hours and day length for the Day and Week views (go to them with {kbd} and {kbd2}). Each device keeps its own; they are not synced.', { kbd: <Kbd k={keysOf('go.day')} />, kbd2: <Kbd k={keysOf('go.week')} /> })}</>
    }>
      <SettingRow label={t('Grid starts')} htmlFor="grid-start" control={
        <Select id="grid-start" className="sm:w-32" aria-label={t('Grid start hour')} value={prefs.startHour}
          onChange={(e) => onSave({ startHour: Number(e.target.value), endHour: Math.max(prefs.endHour, Number(e.target.value) + 1) })}>
          {HOURS.slice(0, 24).map((h) => <option key={h} value={h}>{hour(h)}</option>)}
        </Select>
      } />
      <SettingRow label={t('Grid ends')} htmlFor="grid-end" control={
        <Select id="grid-end" className="sm:w-32" aria-label={t('Grid end hour')} value={prefs.endHour} onChange={(e) => onSave({ endHour: Number(e.target.value) })}>
          {HOURS.filter((h) => h > prefs.startHour).map((h) => <option key={h} value={h}>{hour(h)}</option>)}
        </Select>
      } />
      <SettingRow label={t('Day length')} description={t('Your daily capacity; the Day view warns when planned work goes over it.')} htmlFor="day-length" control={
        <Select id="day-length" className="sm:w-32" aria-label={t('Day length')} value={prefs.dayLength} onChange={(e) => onSave({ dayLength: Number(e.target.value) })}>
          {lengths.map((m) => <option key={m} value={m}>{formatMinutes(m)}</option>)}
        </Select>
      } />
    </SettingsSection>
  )
}

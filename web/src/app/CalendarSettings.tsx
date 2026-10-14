import { setMeta } from '../lib/db'
import { GRID_PREFS_META_KEY, normalizeGridPrefs, type GridPrefs } from '../lib/calendar'
import { formatMinutes } from '../lib/duration'
import { Select } from '../ui/Field'
import { SettingRow, SettingsSection } from '../ui/patterns/SettingsSection'
import { useGridPrefs } from './CalendarView'

const HOURS = Array.from({ length: 25 }, (_, h) => h)
const DAY_LENGTHS = [240, 300, 360, 420, 480, 540, 600, 720]
const hour = (h: number) => `${String(h).padStart(2, '0')}:00`

/** Day and Week view preferences (OpenSpec `time-blocking`, design D7): this device only, never synced. */
export function CalendarSettingsSection() {
  const prefs = useGridPrefs()
  return <CalendarSettingsView prefs={prefs} onSave={(patch) => void setMeta(GRID_PREFS_META_KEY, normalizeGridPrefs({ ...prefs, ...patch }))} />
}

export function CalendarSettingsView({ prefs, onSave }: { prefs: GridPrefs; onSave: (patch: Partial<GridPrefs>) => void }) {
  const lengths = DAY_LENGTHS.includes(prefs.dayLength) ? DAY_LENGTHS : [...DAY_LENGTHS, prefs.dayLength].sort((a, b) => a - b)
  return (
    <SettingsSection title="Calendar" helpId="settings/calendar" headingId="calendar-heading" description={
      <>Working hours and day length for the Day and Week views (<span className="kbd">g</span> <span className="kbd">d</span>,{' '}
        <span className="kbd">g</span> <span className="kbd">w</span>). Each device keeps its own; they are not synced.</>
    }>
      <SettingRow label="Grid starts" htmlFor="grid-start" control={
        <Select id="grid-start" className="sm:w-32" aria-label="Grid start hour" value={prefs.startHour}
          onChange={(e) => onSave({ startHour: Number(e.target.value), endHour: Math.max(prefs.endHour, Number(e.target.value) + 1) })}>
          {HOURS.slice(0, 24).map((h) => <option key={h} value={h}>{hour(h)}</option>)}
        </Select>
      } />
      <SettingRow label="Grid ends" htmlFor="grid-end" control={
        <Select id="grid-end" className="sm:w-32" aria-label="Grid end hour" value={prefs.endHour} onChange={(e) => onSave({ endHour: Number(e.target.value) })}>
          {HOURS.filter((h) => h > prefs.startHour).map((h) => <option key={h} value={h}>{hour(h)}</option>)}
        </Select>
      } />
      <SettingRow label="Day length" description="Your daily capacity; the Day view warns when planned work goes over it." htmlFor="day-length" control={
        <Select id="day-length" className="sm:w-32" aria-label="Day length" value={prefs.dayLength} onChange={(e) => onSave({ dayLength: Number(e.target.value) })}>
          {lengths.map((m) => <option key={m} value={m}>{formatMinutes(m)}</option>)}
        </Select>
      } />
    </SettingsSection>
  )
}

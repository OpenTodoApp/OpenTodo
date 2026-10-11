import { setMeta } from '../lib/db'
import { HelpHeading } from './help/HelpLink'
import { GRID_PREFS_META_KEY, normalizeGridPrefs, type GridPrefs } from '../lib/calendar'
import { formatMinutes } from '../lib/duration'
import { useGridPrefs } from './CalendarView'

const HOURS = Array.from({ length: 25 }, (_, h) => h)
const DAY_LENGTHS = [240, 300, 360, 420, 480, 540, 600, 720]

/** Day and Week view preferences (OpenSpec `time-blocking`, design D7): this device only, never synced. */
export function CalendarSettingsSection() {
  const prefs = useGridPrefs()
  const save = (patch: Partial<GridPrefs>) => void setMeta(GRID_PREFS_META_KEY, normalizeGridPrefs({ ...prefs, ...patch }))
  const lengths = DAY_LENGTHS.includes(prefs.dayLength) ? DAY_LENGTHS : [...DAY_LENGTHS, prefs.dayLength].sort((a, b) => a - b)
  return (
    <section className="space-y-2">
      <HelpHeading screen="settings/calendar" className="font-semibold">Calendar</HelpHeading>
      <p className="text-sm text-slate-500">
        Working hours and day length for the Day and Week views (<span className="kbd">g</span> <span className="kbd">d</span>,{' '}
        <span className="kbd">g</span> <span className="kbd">w</span>). Each device keeps its own; they are not synced.
      </p>
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label className="space-y-1">
          <span className="block text-xs text-slate-500">Grid starts</span>
          <select className="input w-28" aria-label="Grid start hour" value={prefs.startHour}
            onChange={(e) => save({ startHour: Number(e.target.value), endHour: Math.max(prefs.endHour, Number(e.target.value) + 1) })}>
            {HOURS.slice(0, 24).map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-slate-500">Grid ends</span>
          <select className="input w-28" aria-label="Grid end hour" value={prefs.endHour} onChange={(e) => save({ endHour: Number(e.target.value) })}>
            {HOURS.filter((h) => h > prefs.startHour).map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-slate-500">Day length (capacity)</span>
          <select className="input w-32" aria-label="Day length" value={prefs.dayLength} onChange={(e) => save({ dayLength: Number(e.target.value) })}>
            {lengths.map((m) => <option key={m} value={m}>{formatMinutes(m)}</option>)}
          </select>
        </label>
      </div>
    </section>
  )
}

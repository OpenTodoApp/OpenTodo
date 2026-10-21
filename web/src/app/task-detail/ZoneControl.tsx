// The zone control next to a timed due (OpenSpec task-detail-redesign, design D4):
// a chip reading "Floating" or "New York · UTC−4" that opens a small panel which
// explains both modes, fixes the due to the viewer's zone or releases it, and fixes
// it to any IANA zone with a preview of how it reads in the viewer's zone. Every
// change is one ordinary due edit through updateTask; `z` toggles as before.
import { useMemo, useRef, useState } from 'react'
import { dueToInstant, fixDueToZone, isKnownZone, localDueOf, releaseDue, setDueZone, zoneCity } from '../../lib/dates'
import { updateTask } from '../../lib/ops'
import type { Due, Task } from '../../lib/types'
import { Button, Popover } from '../../ui'
import { Tooltip } from '../../ui'
import { ComboboxPanel } from '../../ui'
import { Icon } from '../../ui'
import { useDateTimeFormat } from '../DateTimePrefsProvider'
import { useViewerZone } from '../useViews'
import { useShortcutScope } from '../shortcuts'
import { t } from '../../lib/i18n'
import { act } from '../actionError'

/** `z` with the panel open (not typing) toggles the zone; listed in the shortcut help. */
export const ZONE_TOGGLE_KEY = 'z'
/** Pick history context for zones (ui-primitives pickRank), device-local. */
export const ZONE_RANK_CONTEXT = 'due.zone'

/**
 * "GMT+2" → "UTC+2", "GMT-04:00" → "UTC−4", "GMT+5:30" → "UTC+5:30". ICU versions
 * write a zero offset differently ("GMT", "GMT+0", "GMT+00:00"); all read "UTC".
 */
export function offsetLabel(gmt: string): string {
  if (/^GMT(?:[+-]0+(?::00)?)?$/.test(gmt)) return 'UTC'
  return `UTC${gmt.slice(3).replace(/^([+-])0?(\d+)(?::00)?/, '$1$2').replace('-', '−')}`
}

/** "UTC+2", "UTC−4", "UTC+5:30" or "UTC" for `zone` at instant `at`; '' when the platform cannot tell. */
export function zoneOffset(zone: string, at: number = Date.now()): string {
  for (const style of ['shortOffset', 'longOffset'] as const) {
    try {
      const part = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: style }).formatToParts(at).find((p) => p.type === 'timeZoneName')?.value
      if (!part || !/^GMT/.test(part)) continue
      return offsetLabel(part)
    } catch {
      // try the next style
    }
  }
  return ''
}

/** Chip text: "Floating" or "City · UTC+2". */
export function zoneChipText(due: Due | null | undefined): string {
  if (!due?.tz) return t('Floating')
  const offset = zoneOffset(due.tz, due.time ? dueToInstant(due, due.tz) : Date.now())
  const city = zoneCity(due.tz)
  return offset && offset !== city ? `${city} · ${offset}` : city
}

/** Every IANA zone the platform knows, else the viewer's zone plus the given ones. */
export function allZones(viewer: string, inUse: readonly string[] = []): string[] {
  const supported = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf
  let list: string[] = []
  try { list = supported ? supported('timeZone') : [] } catch { list = [] }
  if (!list.length) list = [viewer, ...inUse]
  return [...new Set([viewer, ...list])].filter(isKnownZone)
}

interface ZoneItem { zone: string; city: string; secondary: string }

export interface ZoneControlProps {
  task: Task
  readOnly?: boolean
  /** The viewer's zone; defaults to the live one (stories and tests pass a fixed zone). */
  viewerZone?: string
  /** Opens the panel on mount (stories). */
  defaultOpen?: boolean
  /** `line`: a quiet "Floating time · Change" line (the Do on segment); `chip` by default. */
  variant?: 'chip' | 'line'
}

export function ZoneControl({ task, readOnly = false, viewerZone, defaultOpen = false, variant = 'chip' }: ZoneControlProps) {
  const liveZone = useViewerZone()
  const zone = viewerZone ?? liveZone
  const dt = useDateTimeFormat()
  const due = task.due
  const canFix = !!due?.time
  const zoned = !!due?.tz
  const [open, setOpen] = useState(defaultOpen && canFix)
  const [candidate, setCandidate] = useState<string | null>(null)
  const chip = useRef<HTMLButtonElement>(null)

  const write = (next: Due | null) => { if (next) act(updateTask(task.id, { due: next })) }
  const toggleZone = () => {
    if (!due?.time) return
    write(zoned ? releaseDue(due, zone) : fixDueToZone(due, zone))
  }

  // The `z` shortcut (absolute-datetimes), now the `panel.zone` registry entry.
  useShortcutScope('panel', { 'panel.zone': () => { if (readOnly) return false; toggleZone() } })

  const items = useMemo<ZoneItem[]>(() => {
    if (!open) return []
    const now = Date.now()
    return allZones(zone, due?.tz ? [due.tz] : []).map((z) => {
      const region = z.includes('/') ? z.slice(0, z.indexOf('/')).replace(/_/g, ' ') : ''
      const offset = zoneOffset(z, now)
      return { zone: z, city: zoneCity(z), secondary: [z === zone ? t('Your zone') : region, offset].filter(Boolean).join(' · ') }
    })
  }, [open, zone, due?.tz])

  const close = () => { setOpen(false); setCandidate(null) }
  const reason = t('Set a time to fix this due to a time zone')
  const text = zoneChipText(due)

  // "15:00 in New York = 21:00 your time (Berlin)" for a due fixed (or about to be fixed) to `z`.
  const preview = (z: string) => {
    if (!due?.time) return ''
    const fixed = setDueZone(due, z)
    if (!fixed) return ''
    const local = localDueOf(fixed, zone)
    const there = t('{time} in {city}', { time: dt.formatTime(due.time), city: zoneCity(z) })
    if (z === zone) return t('{there}, your zone', { there })
    const day = local.date !== due.date ? ` (${dt.formatDate(local.date, 'compact')})` : ''
    return t('{there} = {time}{day} your time ({city})', { there, time: dt.formatTime(local.time!), day, city: zoneCity(zone) })
  }

  // In the Do on segment (task-panel-polish D3): one quiet line, "Floating time · Change", shown only with a time.
  const line = variant === 'line' && (
    <span className="flex flex-wrap items-center gap-1 text-meta text-muted" data-zone-line>
      <Icon name="globe" size="xs" className="text-faint" />
      <span>{zoned ? t('Fixed to {zoneCity}', { zoneCity: zoneCity(due!.tz!) }) : t('Floating time')}</span>
      {!readOnly && <span aria-hidden="true" className="text-faint">·</span>}
      {!readOnly && (
        <button ref={chip} type="button" className="rounded-control text-accent hover:underline focus-visible:outline-2 focus-visible:outline-focus"
          aria-label={t('Time zone: {text}', { text })} aria-haspopup="dialog" aria-expanded={open} aria-keyshortcuts={ZONE_TOGGLE_KEY}
          onClick={() => setOpen(true)}>{t('Change')}</button>
      )}
    </span>
  )

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {line || <><Tooltip label={canFix ? t('Time zone') : reason} shortcut={canFix ? ZONE_TOGGLE_KEY : undefined}>
        <button
          ref={chip}
          type="button"
          className="ui-btn ui-btn--secondary ui-btn--sm"
          aria-label={t('Time zone: {text}', { text })}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-keyshortcuts={readOnly ? undefined : ZONE_TOGGLE_KEY}
          aria-describedby={canFix ? undefined : `zone-reason-${task.id}`}
          disabled={readOnly || !canFix}
          onClick={() => setOpen(true)}
        >
          <Icon name="globe" size="sm" />{text}
        </button>
      </Tooltip>
      {!canFix && due && <span id={`zone-reason-${task.id}`} className="text-meta text-faint">{reason}</span>}</>}
      <Popover open={open} onClose={close} anchor={chip} label={t('Time zone')} align="start" width="sm:w-80" className="space-y-3 p-3">
        <div className="space-y-2 text-meta">
          <p className={zoned ? 'text-muted' : 'text-default'} data-testid="zone-mode-floating">
            <strong className="font-semibold">{zoned ? t('Floating:') : t('Floating (now):')}</strong>{' '}{t('the same clock time wherever you are.')}
          </p>
          <p className={zoned ? 'text-default' : 'text-muted'} data-testid="zone-mode-fixed">
            <strong className="font-semibold">{zoned ? t('Fixed to a time zone (now):') : t('Fixed to a time zone:')}</strong>{' '}{t('one moment worldwide, shown in each viewer\'s own time.')}
          </p>
        </div>
        {zoned
          ? <Button size="sm" icon="globe" onClick={() => { write(releaseDue(due!, zone)); close() }}>{t('Make floating')}</Button>
          : <Button size="sm" icon="globe" onClick={() => { write(fixDueToZone(due!, zone)); close() }}>{t('Fix to my zone ({zoneCity})', { zoneCity: zoneCity(zone) })}</Button>}
        {zoned && !candidate && <p className="text-meta text-muted" data-testid="zone-preview">{preview(due!.tz!)}</p>}
        <ComboboxPanel<ZoneItem>
          label={t('Fix to another time zone')}
          placeholder={t('Search a city or zone')}
          source={items}
          getKey={(i) => i.zone}
          getLabel={(i) => i.city}
          getSecondary={(i) => i.secondary}
          pinned={[zone]}
          selected={due?.tz ? [due.tz] : []}
          rankContext={ZONE_RANK_CONTEXT}
          onPick={(i) => setCandidate(i.zone)}
          emptyText={t('No zone matches')}
        />
        {candidate && (
          <div className="space-y-2 rounded-control bg-sunken p-2 dark:bg-raised">
            <p className="text-meta text-default" role="status" data-testid="zone-preview">{preview(candidate)}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="primary" onClick={() => { write(setDueZone(due!, candidate)); close() }}>{t('Fix to {zoneCity}', { zoneCity: zoneCity(candidate) })}</Button>
              <Button size="sm" variant="ghost" onClick={() => setCandidate(null)}>{t('Cancel')}</Button>
            </div>
          </div>
        )}
      </Popover>
    </span>
  )
}

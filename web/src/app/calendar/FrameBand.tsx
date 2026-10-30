// Frames on the Day and Week grid (OpenSpec change calendar-frames, design D3, D4):
// each occurrence is a quiet background band behind the blocks, a faint tint of
// its colour with a hairline top and the title and times in the faint tone. Only
// the title takes the pointer: it opens a popover (a bottom sheet on phones) with
// Plan from this frame, Edit and Delete. Drops, drags and the now line pass through.
import { useRef, useState } from 'react'
import { formatTime } from '../../lib/dates'
import { deleteFrameUndoable, frameSource, frameTarget, frameSourceRequest, weekdaysLabel, type FrameOccurrence, type PlacedFrame } from '../../lib/frames'
import { t } from '../../lib/i18n'
import { useLabels } from '../../lib/localData'
import { useLiveProjects } from '../../lib/liveData'
import { Button, hueFor, Popover } from '../../ui'
import { showUndoToast } from '../bulk/toastStore'
import { useDateTimeFormat } from '../DateTimePrefsProvider'
import { useViews } from '../useViews'
import { requestFrames } from './framesRequest'
import { PX_PER_MIN } from './grid'
import { openPlanPanel } from './PlanPanel'

/** The bands of one day column, below every block layer. */
export function FrameBands({ frames, past }: { frames: readonly PlacedFrame[]; past: boolean }) {
  return <>{frames.map((f) => <FrameBand key={`${f.frame.id}:${f.date}`} occ={f} past={past} />)}</>
}

function FrameBand({ occ, past }: { occ: PlacedFrame; past: boolean }) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const title = occ.frame.title || t('Untitled')
  const times = `${formatTime(occ.frame.start)}–${formatTime(occ.frame.end)}`
  return (
    <div data-frame-band={occ.frame.id} data-hue={hueFor(occ.frame.color)}
      className={`ui-frame-band pointer-events-none absolute z-0 overflow-hidden ${past ? 'ui-frame-band--past' : ''}`}
      style={{
        top: occ.start * PX_PER_MIN, height: (occ.end - occ.start) * PX_PER_MIN,
        left: `${(occ.lane / occ.lanes) * 100}%`, width: `${100 / occ.lanes}%`,
      }}>
      <button ref={anchor} type="button" data-frame-name={occ.frame.id} aria-haspopup="dialog" aria-expanded={open}
        aria-label={t('Frame {title}, {times}', { title, times })}
        className="pointer-events-auto block min-h-6 max-w-full truncate rounded-chip px-1.5 pt-0.5 text-left text-hint text-faint outline-none hover:text-muted focus-visible:ring-2 focus-visible:ring-focus"
        onPointerDown={(e) => e.stopPropagation()} onClick={() => setOpen(true)}>
        {title} · <span className="tabular-nums">{times}</span>
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={anchor} label={title} align="start" width="sm:w-72" className="p-3">
        <FrameDetails occ={occ} onDone={() => setOpen(false)} />
      </Popover>
    </div>
  )
}

/** The popover's content: title, repeat and times, the source, and the three actions. */
export function FrameDetails({ occ, onDone }: { occ: FrameOccurrence; onDone: () => void }) {
  const { resolved } = useDateTimeFormat()
  const name = useSourceName(occ.frame.source)
  const f = occ.frame
  return (
    <div className="space-y-3" data-frame-details={f.id}>
      <div>
        <p className="flex items-center gap-2 text-body font-medium text-strong">
          <span aria-hidden data-hue={hueFor(f.color)} className="ui-block-dot" />{f.title || t('Untitled')}
        </p>
        <p className="text-meta text-muted">{weekdaysLabel(f.weekdays, resolved.weekStart)} · {formatTime(f.start)}–{formatTime(f.end)}</p>
        {name && <p className="text-meta text-muted" data-frame-source-name>{t('Plans from {source}', { source: name })}</p>}
      </div>
      <div className="flex flex-col gap-1">
        <Button variant="secondary" icon="list" data-frame-plan onClick={() => { planFromFrame(occ); onDone() }}>{t('Plan from this frame')}</Button>
        <div className="flex gap-1">
          <Button variant="ghost" icon="pencil" className="flex-1" data-frame-edit-action onClick={() => { onDone(); requestFrames({ mode: 'edit', id: f.id }) }}>{t('Edit')}</Button>
          <Button variant="ghost" icon="trash-2" className="flex-1" data-frame-delete onClick={() => { onDone(); void deleteFrame(f.id) }}>{t('Delete')}</Button>
        </div>
      </div>
    </div>
  )
}

async function deleteFrame(id: string): Promise<void> {
  const r = await deleteFrameUndoable(id)
  if (r.entry) showUndoToast(r.label, r.entry.id)
}

/** The name of a frame's planning source, or null without one or when it no longer exists. */
function useSourceName(source: string): string | null {
  const projects = useLiveProjects()
  const labels = useLabels()
  const views = useViews()
  const s = frameSource(source)
  if (!s) return null
  const row = s.kind === 'project' ? projects.find((p) => p.id === s.id && !p.archived && !p.deleted_at)
    : s.kind === 'label' ? labels.find((l) => l.id === s.id && !l.deleted_at)
      : views.find((v) => v.id === s.id && !v.deleted_at)
  return row?.name ?? null
}

/**
 * Plan from this frame (design D4): the planning list opens with the frame's source
 * (it keeps its own when the frame has none or the source is gone) and this
 * occurrence becomes the placement target while the list stays open.
 */
export function planFromFrame(occ: FrameOccurrence): void {
  frameTarget.set({ frameId: occ.frame.id, date: occ.date, start: occ.start, end: occ.end })
  if (frameSource(occ.frame.source)) frameSourceRequest.set({ key: occ.frame.source, n: (frameSourceRequest.get()?.n ?? 0) + 1 })
  openPlanPanel()
}

/**
 * A frame on the phone's week agenda (design D6): a heading line inside its day,
 * "Deep work · 09:00–11:00" in the faint tone with the colour's dot; tapping it opens
 * the frame's sheet.
 */
export function FrameHeading({ occ }: { occ: FrameOccurrence }) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const title = occ.frame.title || t('Untitled')
  return (
    <li data-agenda-frame={occ.frame.id}>
      <button ref={anchor} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}
        className="flex min-h-8 w-full items-center gap-2 rounded-control px-2 text-left text-meta text-faint outline-none hover:text-muted focus-visible:ring-2 focus-visible:ring-focus">
        <span aria-hidden data-hue={hueFor(occ.frame.color)} className="ui-block-dot" />
        <span className="min-w-0 truncate">{title} · <span className="tabular-nums">{formatTime(occ.frame.start)}–{formatTime(occ.frame.end)}</span></span>
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={anchor} label={title} align="start" width="sm:w-72" className="p-3">
        <FrameDetails occ={occ} onDone={() => setOpen(false)} />
      </Popover>
    </li>
  )
}

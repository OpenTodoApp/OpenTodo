// The Frames dialog (OpenSpec change calendar-frames, design D5): the user's frames
// in their order with Add, Edit, Delete and reordering (drag, Alt+Up/Down), and the
// form: title, weekday toggles in the week's order, start and end in 15-minute steps
// and the user's time format, a colour, an optional planning source chosen with the
// Combobox, and optional first and last dates under More options. Loaded lazily.
import { type FormEvent, type KeyboardEvent, useMemo, useRef, useState } from 'react'
import { formatTime } from '../../lib/dates'
import {
  clockOf, createFrame, deleteFrameUndoable, FRAME_STEP, frameInputError, frameTimesValid, MAX_FRAME_TITLE, MAX_FRAMES, parseWeekdays,
  reorderFrames, updateFrame, useFrames, weekdayName, weekdaysLabel, weekOrder, type FrameInput,
} from '../../lib/frames'
import { t } from '../../lib/i18n'
import { FRAME_DEFAULTS } from '../../lib/ops'
import { useLabels } from '../../lib/localData'
import { useLiveProjects } from '../../lib/liveData'
import type { Frame } from '../../lib/types'
import { Button, ComboboxPanel, Dialog, EmptyState, Field, hueFor, Icon, Popover, Select } from '../../ui'
import { actionErrorMessage } from '../actionError'
import { showUndoToast } from '../bulk/toastStore'
import { useDateTimeFormat } from '../DateTimePrefsProvider'
import { WorkspaceColours } from '../NewWorkspaceDialog'
import { useViews } from '../useViews'
import { planSources, type PlanSource } from './planSource'
import type { FramesRequest } from './framesRequest'

const DEFAULT_COLOR = FRAME_DEFAULTS.color

type Screen = { kind: 'list' } | { kind: 'form'; id: string | null; prefill?: Extract<FramesRequest, { mode: 'new' }>['prefill'] }

function initialScreen(r: FramesRequest): Screen {
  if (r.mode === 'new') return { kind: 'form', id: null, prefill: r.prefill }
  if (r.mode === 'edit') return { kind: 'form', id: r.id }
  return { kind: 'list' }
}

export default function FramesDialog({ request, onClose }: { request: FramesRequest; onClose: () => void }) {
  const [screen, setScreen] = useState<Screen>(() => initialScreen(request))
  const frames = useFrames()
  // Opened on a form (palette, Edit, empty slot): its Cancel closes; from the list it steps back.
  const back = request.mode === 'list' ? () => setScreen({ kind: 'list' }) : onClose
  if (screen.kind === 'form') {
    const frame = screen.id ? frames.find((f) => f.id === screen.id) : undefined
    if (screen.id && !frame) return null
    return (
      <Dialog title={frame ? t('Edit frame') : t('New frame')} onClose={onClose} size="md" testId="frame-form" onEscape={request.mode === 'list' ? back : undefined}>
        <FrameForm key={screen.id ?? 'new'} frame={frame} prefill={screen.prefill} count={frames.length} onDone={back} />
      </Dialog>
    )
  }
  return (
    <Dialog title={t('Frames')} onClose={onClose} size="md" testId="frames-dialog">
      <FrameList frames={frames} onAdd={() => setScreen({ kind: 'form', id: null })} onEdit={(id) => setScreen({ kind: 'form', id })} />
    </Dialog>
  )
}

function FrameList({ frames, onAdd, onEdit }: { frames: Frame[]; onAdd: () => void; onEdit: (id: string) => void }) {
  const { resolved } = useDateTimeFormat()
  const [dragging, setDragging] = useState<string | null>(null)
  const list = useRef<HTMLUListElement>(null)
  const full = frames.length >= MAX_FRAMES
  const move = (id: string, delta: number) => {
    const ids = frames.map((f) => f.id)
    const i = ids.indexOf(id), j = i + delta
    if (i < 0 || j < 0 || j >= ids.length) return
    ids.splice(i, 1)
    ids.splice(j, 0, id)
    void reorderFrames(ids).then(() => list.current?.querySelector<HTMLElement>(`[data-frame-row="${id}"] [data-frame-edit]`)?.focus())
  }
  const dropOn = (target: string) => {
    if (!dragging || dragging === target) return
    const ids = frames.map((f) => f.id).filter((id) => id !== dragging)
    ids.splice(ids.indexOf(target) + (frames.findIndex((f) => f.id === dragging) < frames.findIndex((f) => f.id === target) ? 1 : 0), 0, dragging)
    void reorderFrames(ids)
  }
  const remove = async (f: Frame) => {
    const r = await deleteFrameUndoable(f.id)
    if (r.entry) showUndoToast(r.label, r.entry.id)
  }
  return (
    <div className="space-y-3">
      {frames.length === 0
        ? <EmptyState compact title={t('Frames shade the hours you keep for one kind of work.')} />
        : (
          <ul ref={list} className="divide-y divide-default" aria-label={t('Frames')}>
            {frames.map((f) => (
              <li key={f.id} data-frame-row={f.id} draggable onDragStart={() => setDragging(f.id)} onDragEnd={() => setDragging(null)}
                onDragOver={(e) => e.preventDefault()} onDrop={() => dropOn(f.id)}
                className={`flex items-center gap-2 py-2 ${dragging === f.id ? 'opacity-60' : ''}`}> {/* tone-lint-allow: the dragged row */}
                <Icon name="grip-vertical" size="xs" className="shrink-0 cursor-grab text-faint" />
                <span aria-hidden data-hue={hueFor(f.color)} className="ui-block-dot" />
                <button type="button" data-frame-edit className="min-w-0 flex-1 rounded-control text-left outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown" onClick={() => onEdit(f.id)}
                  onKeyDown={(e: KeyboardEvent) => {
                    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
                    e.preventDefault()
                    move(f.id, e.key === 'ArrowUp' ? -1 : 1)
                  }}>
                  <span className="block truncate text-body text-strong">{f.title || t('Untitled')}</span>
                  <span className="block truncate text-meta text-muted">
                    {weekdaysLabel(f.weekdays, resolved.weekStart)} · {formatTime(f.start)}–{formatTime(f.end)}
                    {!frameTimesValid(f) && <span className="ml-1 text-warning" data-frame-fix>· {t('Times need fixing')}</span>}
                  </span>
                </button>
                <Button variant="ghost" size="sm" icon="trash-2" aria-label={t('Delete {name}', { name: f.title || t('Untitled') })} onClick={() => void remove(f)} />
              </li>
            ))}
          </ul>
        )}
      {full && <p className="text-meta text-muted" role="status">{t('You can keep up to {n} frames.', { n: MAX_FRAMES })}</p>}
      <div className="flex justify-end">
        <Button variant="primary" icon="plus" disabled={full} onClick={onAdd} data-frame-add>{t('Add frame')}</Button>
      </div>
    </div>
  )
}

/** Start and end choices: every quarter hour, plus the stored value when it is between them. */
function timeOptions(current: string): string[] {
  const steps = Array.from({ length: (24 * 60) / FRAME_STEP }, (_, i) => clockOf(i * FRAME_STEP))
  steps.push('23:59')
  if (current && !steps.includes(current)) steps.push(current)
  return steps.sort()
}

function FrameForm({ frame, prefill, count, onDone }: { frame?: Frame; prefill?: Extract<FramesRequest, { mode: 'new' }>['prefill']; count: number; onDone: () => void }) {
  const { resolved } = useDateTimeFormat()
  const [v, setV] = useState<FrameInput>(() => frame
    ? { title: frame.title, weekdays: frame.weekdays, start: frame.start, end: frame.end, color: frame.color, source: frame.source, from_date: frame.from_date, until_date: frame.until_date }
    : { title: '', weekdays: prefill?.weekday ? String(prefill.weekday) : '1,2,3,4,5', start: prefill?.start ?? '09:00', end: prefill?.end ?? '11:00', color: DEFAULT_COLOR, source: '', from_date: null, until_date: null })
  const [error, setError] = useState<string | null>(null)
  const [more, setMore] = useState(!!(frame?.from_date || frame?.until_date))
  const set = (patch: Partial<FrameInput>) => { setV((cur) => ({ ...cur, ...patch })); setError(null) }
  const days = new Set(parseWeekdays(v.weekdays))
  const toggle = (d: number) => {
    const next = new Set(days)
    if (next.has(d)) next.delete(d)
    else next.add(d)
    set({ weekdays: [...next].join(',') })
  }
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!frame && count >= MAX_FRAMES) return setError(t('You can keep up to {n} frames.', { n: MAX_FRAMES }))
    const problem = frameInputError(v)
    if (problem) return setError(problem)
    try {
      if (frame) await updateFrame(frame.id, v)
      else await createFrame(v)
      onDone()
    } catch (err) {
      setError(actionErrorMessage(err))
    }
  }
  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3" noValidate>
      <Field label={t('Title')}>
        <input className="ui-input" autoFocus maxLength={MAX_FRAME_TITLE} value={v.title} placeholder={t('Deep work')} data-frame-title
          onChange={(e) => set({ title: e.target.value })} />
      </Field>
      <fieldset>
        <legend className="mb-1 text-meta text-muted">{t('Repeat on')}</legend>
        <div className="flex flex-wrap gap-1" data-frame-days>
          {weekOrder(resolved.weekStart).map((d) => (
            <button key={d} type="button" aria-pressed={days.has(d)} aria-label={weekdayName(d, 'long')} data-weekday={d} onClick={() => toggle(d)}
              className={`ui-btn ui-btn--sm min-w-11 text-meta ${days.has(d) ? 'ui-btn--primary' : 'ui-btn--secondary'}`}>
              {weekdayName(d)}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="flex gap-2">
        <Field label={t('Start')} className="flex-1">
          <Select value={v.start} onChange={(e) => set({ start: e.target.value })} data-frame-start>
            {timeOptions(v.start).filter((c) => c !== '23:59').map((c) => <option key={c} value={c}>{formatTime(c)}</option>)}
          </Select>
        </Field>
        <Field label={t('End')} className="flex-1">
          <Select value={v.end} onChange={(e) => set({ end: e.target.value })} data-frame-end>
            {timeOptions(v.end).filter((c) => c !== '00:00').map((c) => <option key={c} value={c}>{formatTime(c)}</option>)}
          </Select>
        </Field>
      </div>
      <Field label={t('Colour')}>
        <WorkspaceColours value={v.color} onPick={(hex) => set({ color: hex || DEFAULT_COLOR })} />
      </Field>
      <SourcePicker value={v.source} onPick={(source) => set({ source })} />
      <div>
        <button type="button" className="inline-flex items-center gap-1 text-meta text-muted hover:text-default" aria-expanded={more} onClick={() => setMore(!more)} data-frame-more>
          <Icon name={more ? 'chevron-down' : 'chevron-right'} size="xs" />{t('More options')}
        </button>
        {more && (
          <div className="mt-2 flex gap-2">
            <Field label={t('Starts')} className="flex-1">
              <input type="date" className="ui-input" value={v.from_date ?? ''} onChange={(e) => set({ from_date: e.target.value || null })} data-frame-from />
            </Field>
            <Field label={t('Ends')} className="flex-1">
              <input type="date" className="ui-input" value={v.until_date ?? ''} onChange={(e) => set({ until_date: e.target.value || null })} data-frame-until />
            </Field>
          </div>
        )}
      </div>
      {error && <p role="alert" className="text-meta text-danger" data-frame-error>{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>{t('Cancel')}</Button>
        <Button variant="primary" type="submit" data-frame-save>{t('Save')}</Button>
      </div>
    </form>
  )
}

/** Plan from: no source, or a project, label or saved view chosen with the Combobox. */
function SourcePicker({ value, onPick }: { value: string; onPick: (key: string) => void }) {
  const projects = useLiveProjects()
  const labels = useLabels()
  const views = useViews()
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const none: PlanSource = { key: '', kind: 'list', label: t('No source') }
  const sources = useMemo(() => [none, ...planSources({ projects, labels, views }).filter((s) => s.kind !== 'list')],
    [projects, labels, views]) // eslint-disable-line react-hooks/exhaustive-deps -- `none` is a constant per render language
  const chosen = sources.find((s) => s.key === value)
  const group: Record<string, string> = { project: t('Projects'), label: t('Labels'), view: t('Saved views') }
  return (
    <Field label={t('Plan from')} description={t('The planning list opens on it when you plan from this frame.')}>
      <button ref={anchor} type="button" className="ui-input flex items-center gap-2 text-left" aria-haspopup="dialog" aria-expanded={open} data-frame-source={value}
        onClick={() => setOpen(true)}>
        <span className="min-w-0 flex-1 truncate">{chosen ? chosen.label : value ? t('A source that no longer exists') : t('No source')}</span>
        <Icon name="chevron-down" size="xs" />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={anchor} label={t('Plan from')} align="start" width="sm:w-80" className="p-2">
        <ComboboxPanel<PlanSource>
          label={t('Plan from')}
          placeholder={t('Find a project, label or view…')}
          emptyText={t('Nothing matches.')}
          source={sources}
          getKey={(s) => s.key || 'none'}
          getLabel={(s) => s.label}
          getGroup={(s) => group[s.kind]}
          pinned={['none']}
          selected={[value || 'none']}
          onPick={(s) => { onPick(s.key); setOpen(false) }}
          onClose={() => setOpen(false)}
        />
      </Popover>
    </Field>
  )
}

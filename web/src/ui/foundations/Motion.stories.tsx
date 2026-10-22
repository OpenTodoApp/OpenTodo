// Foundations → Motion (OpenSpec change motion-v2, design-system "Motion sequences in
// the workbench", design D9): every sequence with a Play control, at rest until
// played, so the visual baselines are taken at rest. The rows and cards here carry the
// same attributes the app's rows do (`data-departing`, `data-rolled`, `data-restored`),
// so the sequences are the stylesheet's own; `scripts/ui-check/motion.mjs` plays each
// story with reduced motion and with no motion and fails on movement that survives.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { Button } from '../Button'
import { Icon } from '../Icon'
import { Dialog } from '../overlay/Dialog'
import { ToastRegion } from '../overlay/Toasts'
import { Section } from './tokens'

const MOMENT_MS = 400

interface DemoRow { id: string; title: string; meta: string }
const ROWS: DemoRow[] = [
  { id: 'a', title: 'Pay the electricity bill', meta: 'Today' },
  { id: 'b', title: 'Call the dentist about Friday', meta: 'Today · Health' },
  { id: 'c', title: 'Return the library books', meta: 'Today' },
  { id: 'd', title: 'Draft the quarterly update', meta: 'Today · Work' },
]

function Row({ row, done = false, state, card = false }: { row: DemoRow; done?: boolean; state?: 'leave' | 'rolled' | 'restored'; card?: boolean }) {
  return (
    <li data-departing={state === 'leave' ? row.id : undefined} data-rolled={state === 'rolled' || undefined} data-restored={state === 'restored' || undefined}
      aria-hidden={state === 'leave' || undefined}
      ref={(el) => { if (el && state === 'leave') el.style.setProperty('--row-h', `${el.offsetHeight}px`) }}
      className={`flex items-start gap-2 rounded-control px-2 ${card ? 'border border-default bg-surface py-2 shadow-1' : 'row-pad'}`}>
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
        <span data-check-mark className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${done || state === 'leave' ? 'border-input bg-faint text-on-accent' : 'border-p4'}`}>
          {(done || state === 'leave') && <Icon name="check" size="xs" />}
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col" data-row-open>
        <span className="truncate text-body" data-row-title>{row.title}</span>
        <span className="mt-0.5 text-meta text-muted" data-row-meta>{row.meta}</span>
      </span>
    </li>
  )
}

function Stage({ title, note, onPlay, children }: { title: string; note: string; onPlay: () => void; children: ReactNode }) {
  return (
    <Section title={title}>
      <p className="text-meta text-muted">{note}</p>
      <div><Button variant="secondary" size="sm" icon="repeat" onClick={onPlay} data-play>Play</Button></div>
      <div className="max-w-md">{children}</div>
    </Section>
  )
}

/** Plays a sequence for the moment, then settles; a second press restarts it. */
function usePlay(ms = MOMENT_MS): [number, boolean, () => void] {
  const [run, setRun] = useState(0)
  const [playing, setPlaying] = useState(false)
  const play = () => {
    setRun((n) => n + 1)
    setPlaying(true)
    window.setTimeout(() => setPlaying(false), ms)
  }
  return [run, playing, play]
}

function Completion({ card = false }: { card?: boolean }) {
  const [run, playing, play] = usePlay()
  // After the moment the completed row has left; before Play every row is open.
  const rows = run > 0 && !playing ? ROWS.slice(1) : ROWS
  return (
    <Stage title={card ? 'Completion on a card' : 'Completion on a row'} onPlay={play}
      note="The op is written at once; the row departs over the 400 ms moment: the check pops, the strike draws, the row collapses and the rows below move up.">
      <ul className={card ? 'space-y-1.5 rounded-card bg-canvas p-1.5' : ''} key={run}>
        {rows.map((r, i) => <Row key={r.id} row={r} card={card} state={playing && i === 0 ? 'leave' : undefined} />)}
      </ul>
    </Stage>
  )
}

function Repeating() {
  const [run, playing, play] = usePlay()
  const row = run > 0 ? { ...ROWS[0], title: 'Water the plants', meta: 'Mon 26 Oct · every Monday' } : { ...ROWS[0], title: 'Water the plants', meta: 'Today · every Monday' }
  return (
    <Stage title="Repeating completion" onPlay={play}
      note="A repeating task stays: the check pops and reopens, the next date fades in and the row tints briefly. Nothing collapses.">
      <ul key={run}><Row row={row} state={playing ? 'rolled' : undefined} /></ul>
    </Stage>
  )
}

function Reflow() {
  const [order, setOrder] = useState(ROWS)
  const play = () => {
    const next = [...order.slice(1), order[0]]
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'none'
    if (!doc.startViewTransition || reduced) { setOrder(next); return }
    doc.startViewTransition(() => flushSync(() => setOrder(next)))
  }
  return (
    <Stage title="List reflow" onPlay={play}
      note="A local reschedule moves the first row to the end: the rows that stay slide to their places in a view transition, at most 40 of them; reduced motion and sync changes apply at once.">
      <ul>{order.map((r) => <li key={r.id} style={{ viewTransitionName: `story-${r.id}` }}><ul><Row row={r} /></ul></li>)}</ul>
    </Stage>
  )
}

function DialogDemo() {
  const [open, setOpen] = useState(false)
  return (
    <Stage title="Dialog" onPlay={() => setOpen(true)}
      note="From 640 px a dialog fades and scales up from 98 % over 250 ms and leaves in three quarters of that; on a phone it is a full-screen sheet.">
      {open && <Dialog title="Share project" onClose={() => setOpen(false)}><p className="text-body">Invite people by email.</p></Dialog>}
    </Stage>
  )
}

function SheetDemo() {
  const [open, setOpen] = useState(false)
  return (
    <Stage title="Phone sheet" onPlay={() => setOpen(true)}
      note="Below 640 px the bottom sheet slides up over 250 ms and slides down faster; from 640 px it is the centred card.">
      {open && <Dialog title="Start guide" placement="sheet" onClose={() => setOpen(false)}><p className="text-body">Three steps to a calm list.</p></Dialog>}
    </Stage>
  )
}

function PanelDemo() {
  const [run, setRun] = useState(0)
  return (
    <Stage title="Task panel" onPlay={() => setRun((n) => n + 1)}
      note="The panel slides in from its edge when it opens from closed; switching the task it shows changes the content without a slide.">
      {run > 0 && (
        <aside key={run} className="panel-enter rounded-card border border-default bg-surface p-4 shadow-3">
          <p className="text-body font-semibold">Pay the electricity bill</p>
          <p className="mt-1 text-meta text-muted">Today · Home</p>
        </aside>
      )}
    </Stage>
  )
}

function ToastDemo() {
  const [run, setRun] = useState(0)
  return (
    <Stage title="Undo toast" onPlay={() => setRun((n) => n + 1)}
      note="The toast slides up 8 px and fades in over 250 ms, and fades out when it closes.">
      {run > 0 && (
        <ToastRegion label="Last action">
          <div key={run} className="ui-toast pointer-events-auto flex items-center gap-3 rounded-control border border-default bg-surface px-3 py-2 text-body shadow-2">
            <p role="status" className="min-w-0 flex-1">Task completed</p>
            <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm px-2 py-1 text-accent">Undo</button>
          </div>
        </ToastRegion>
      )}
    </Stage>
  )
}

function Tokens() {
  return (
    <Section title="Tokens">
      <p className="text-meta text-muted">Interface 120 ms and emphasis 250 ms, eased with ease-calm; the 400 ms moment and the spring, an ease-out that settles without overshoot, for the completion sequence, list reflow and overlay entrances. Exits take three quarters of their entrance. With reduced motion only colour and opacity fade; with data-motion="none" every duration, the moment too, is zero.</p>
      <div className="flex flex-wrap gap-4">
        <button type="button" className="btn-secondary transition duration-(--duration-ui) ease-calm hover:-translate-y-0.5">Hover: UI 120 ms</button>
        <button type="button" className="btn-secondary transition duration-(--duration-emphasis) ease-calm hover:scale-105">Hover: emphasis 250 ms</button>
        <button type="button" className="btn-secondary transition duration-(--duration-emphasis) ease-spring hover:-translate-y-1">Hover: spring 250 ms</button>
        <button type="button" className="btn-secondary transition duration-(--duration-moment) ease-spring hover:scale-105" data-moment>Hover: moment 400 ms</button>
      </div>
    </Section>
  )
}

const meta: Meta = { title: 'Foundations/Motion' }
export default meta
export const MotionTokens: StoryObj = { name: 'Tokens', render: () => <Tokens /> }
export const CompletionRow: StoryObj = { name: 'Completion', render: () => <Completion /> }
export const CompletionCard: StoryObj = { name: 'Completion on a card', render: () => <Completion card /> }
export const RepeatingCompletion: StoryObj = { name: 'Repeating completion', render: () => <Repeating /> }
export const ListReflow: StoryObj = { name: 'Reflow', render: () => <Reflow /> }
export const DialogMotion: StoryObj = { name: 'Dialog', render: () => <DialogDemo /> }
export const SheetMotion: StoryObj = { name: 'Sheet', render: () => <SheetDemo /> }
export const PanelMotion: StoryObj = { name: 'Panel', render: () => <PanelDemo /> }
export const ToastMotion: StoryObj = { name: 'Toast', render: () => <ToastDemo /> }

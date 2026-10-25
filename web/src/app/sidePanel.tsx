// Task details in a side panel (OpenSpec change task-side-panel). With the "Open tasks:
// In a side panel" preference, every list keeps the Inbox's docked task beside it from
// 1024 px (design D2): `useSidePanel` sets the split of kind `panel`, follows the cursor
// while the panel is open (D4), and gives the slot its empty pane (D8). The panel's
// width is set by the handle on its left edge and kept on this device (D3).
import { type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { t } from '../lib/i18n'
import { useUserPrefsRow } from '../lib/localData'
import { readTaskOpen } from '../lib/userPrefs'
import { Icon, IconButton, useMediaQuery } from '../ui'
import { InboxEmptyPane } from './InboxEmptyPane'
import { closeTaskPanel, followTask, panelTaskId, setPanelTaskId, setPanelWidth, setTaskSplit, sidePanelDocks, SPLIT_QUERY, useSidePanelOpen } from './panel'
import { openTaskPage } from './taskTrail'

/** Whether this account opens tasks in the side panel (the synced preference, D1); the screen width is not considered. */
export function useSidePanelChosen(): boolean {
  return readTaskOpen(useUserPrefsRow()) === 'panel'
}

/**
 * A list page's side panel (D2, D4). `on`: this page is one of the lists that keep it.
 * The cursor's task shows in the panel while it is open and nothing is ticked; the
 * explicit opens (a click, Enter) go through `openTaskPanel`, which reopens a closed panel.
 * `inboxCount` gives the Inbox's own empty pane. Returns whether the side panel applies.
 */
export function useSidePanel({ on, selectedTaskId, ticking, hasRows, inboxCount }: {
  on: boolean
  selectedTaskId: string | null
  ticking: boolean
  hasRows: boolean
  inboxCount?: number
}): boolean {
  const chosen = useSidePanelChosen()
  const active = on && chosen
  useEffect(() => {
    if (!active) return
    const empty = !hasRows ? undefined
      : inboxCount !== undefined ? () => <InboxEmptyPane count={inboxCount} /> : () => <SidePanelEmpty />
    return setTaskSplit(true, empty, 'panel')
  }, [active, hasRows, inboxCount])
  const open = useSidePanelOpen()
  const wide = useMediaQuery(SPLIT_QUERY)
  useEffect(() => {
    if (active && open && wide && !ticking && selectedTaskId) followTask(selectedTaskId)
  }, [active, open, wide, ticking, selectedTaskId])
  return active
}

/**
 * A row's open action on a list without the task list's bindings (the Filter view, saved
 * views, Next, Waiting): a keyboard activation of the row the side panel already shows
 * opens its page, as Enter does (D4); anything else opens the task the usual way.
 */
export function openFromRow(id: string, e?: { detail: number }): void {
  if (e?.detail === 0 && sidePanelDocks() && panelTaskId() === id) openTaskPage(id)
  else setPanelTaskId(id)
}

/** The side panel with no task shown (D8). */
export function SidePanelEmpty() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center" data-side-panel-empty>
      <Icon name="panel-right" size={40} className="mb-2 text-faint" />
      <h2 className="text-body font-medium text-default">{t('No task selected')}</h2>
      <p className="max-w-xs text-meta text-muted">{t('Select a task to see its details here.')}</p>
    </div>
  )
}

/** The side panel's Close for the empty pane; the docked task has its own in its header. */
export function SidePanelClose() {
  return (
    <IconButton icon="x" label={t('Close')} onClick={closeTaskPanel} data-side-panel-close data-overlay-close
      className="touch-target absolute right-3 top-2" />
  )
}

/**
 * Escape with focus inside the side panel closes it (D4); true when it did. Focus goes
 * back to the list's cursor row, or the first row.
 */
export function closeSidePanelFrom(target: EventTarget | null): boolean {
  const el = target instanceof Element ? target : null
  if (!el || !sidePanelDocks() || !el.closest('[data-detail-variant="panel"], [data-split-empty]')) return false
  if (el.closest('[data-overlay]')) return false
  closeTaskPanel()
  requestAnimationFrame(() => {
    const row = document.querySelector<HTMLElement>('li[data-task-id][aria-current="true"] [data-row-open]')
      ?? document.querySelector<HTMLElement>('li[data-task-id] [data-row-open]')
    row?.focus({ preventScroll: true })
  })
  return true
}

const STEP = 16
const BIG_STEP = 64

/** The bounds of the panel's width in CSS pixels, as index.css clamps it (D3). */
export function panelWidthBounds(): { min: number; max: number } {
  const rem = typeof document === 'undefined' ? 16 : parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  const vw = typeof window === 'undefined' ? 1280 : window.innerWidth
  const min = 22 * rem
  return { min, max: Math.max(min, Math.min(64 * rem, vw - 38 * rem)) }
}

/** The width of the panel a handle sits in. */
const measure = (handle: HTMLElement) => Math.round(handle.parentElement?.getBoundingClientRect().width ?? 0)

const clampWidth = (px: number) => {
  const { min, max } = panelWidthBounds()
  return Math.min(max, Math.max(min, px))
}

/**
 * The handle on the docked panel's left edge (D3): drag to resize, or focus it and use
 * ← and → (Shift for larger steps); Home or a double click restores the default width.
 */
export function PanelResizeHandle() {
  const [width, setWidth] = useState<number | null>(null)
  const self = useRef<HTMLDivElement>(null)
  // A focusable separator must say its value (WAI-ARIA window splitter): the panel's width from the first paint.
  useLayoutEffect(() => { if (self.current) setWidth(measure(self.current)) }, [])
  const apply = (px: number | null, el: HTMLElement, persist = true) => {
    setPanelWidth(px === null ? null : clampWidth(px), persist)
    setWidth(measure(el))
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    const el = e.currentTarget
    const startX = e.clientX
    const startW = measure(el)
    el.setPointerCapture?.(e.pointerId)
    const move = (ev: PointerEvent) => apply(startW + (startX - ev.clientX), el, false)
    const up = (ev: PointerEvent) => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      apply(startW + (startX - ev.clientX), el)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const step = e.shiftKey ? BIG_STEP : STEP
    if (e.key === 'ArrowLeft') apply(measure(el) + step, el)
    else if (e.key === 'ArrowRight') apply(measure(el) - step, el)
    else if (e.key === 'Home') apply(null, el)
    else return
    // The list's ← and → (row details, folding) must not see the key.
    e.preventDefault()
    e.stopPropagation()
  }
  const { min, max } = panelWidthBounds()
  return (
    // A focusable separator (WAI-ARIA window splitter): its value is the panel's width.
    <div role="separator" aria-orientation="vertical" tabIndex={0} aria-label={t('Resize the task panel')}
      ref={self} aria-valuenow={width ?? Math.round(min)} aria-valuemin={Math.round(min)} aria-valuemax={Math.round(max)}
      aria-valuetext={t('{n} pixels wide', { n: width ?? Math.round(min) })}
      onPointerDown={onPointerDown} onKeyDown={onKeyDown} onDoubleClick={(e) => apply(null, e.currentTarget)}
      onFocus={(e) => setWidth(measure(e.currentTarget))}
      className="panel-resize absolute inset-y-0 left-0 z-10 hidden w-2 -translate-x-1/2 cursor-col-resize touch-none lg:block"
      data-panel-resize />
  )
}

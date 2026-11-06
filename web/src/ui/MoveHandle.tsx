import { type KeyboardEvent, type PointerEvent, useRef, useState } from 'react'
import { t } from '../lib/i18n'
import { Icon } from './Icon'
import { MenuItem } from './Menu'
import { Menu } from './overlay/Menu'

/**
 * A drag handle that also works without dragging (OpenSpec change accessibility-aa D3,
 * WCAG 2.2 2.5.7 Dragging movements): pressing and moving it drags as before (the
 * caller's `onPointerDown`), a click without moving opens a small menu with Move up and
 * Move down, and the caller's keys (Alt+↑ and Alt+↓) keep working on it. For short
 * ordered lists that have no row menu of their own (frames, a rotation's turn order).
 */
export function MoveHandle({ label, first, last, onMove, onPointerDown, onKeyDown, className = '', ...hooks }: {
  /** The handle's name, which says what moves ("Move Ada (Alt+Up or Alt+Down)"). */
  label: string
  first: boolean
  last: boolean
  onMove: (delta: -1 | 1) => void
  /** Starts the caller's drag. */
  onPointerDown?: (e: PointerEvent<HTMLButtonElement>) => void
  onKeyDown?: (e: KeyboardEvent<HTMLButtonElement>) => void
  className?: string
  [hook: `data-${string}`]: string | boolean | undefined
}) {
  const [open, setOpen] = useState(false)
  // Where the press started and whether it became a drag: a drag's release is no click.
  const press = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const down = (e: PointerEvent<HTMLButtonElement>) => {
    press.current = { x: e.clientX, y: e.clientY, moved: false }
    const p = press.current
    const move = (ev: globalThis.PointerEvent) => { if (Math.hypot(ev.clientX - p.x, ev.clientY - p.y) > 4) p.moved = true }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    onPointerDown?.(e)
  }
  return (
    <Menu label={label} title={t('Move')} kind="menu" width="sm:w-48" align="start"
      open={open} onOpenChange={(v) => { if (v && press.current?.moved) { press.current = null; return } press.current = null; setOpen(v) }}
      trigger={<Icon name="grip-vertical" />}
      triggerClassName={`ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon shrink-0 cursor-grab touch-none ${className}`}
      triggerProps={{ ...hooks, onPointerDown: down, onKeyDown, 'data-move-handle': '' }}>
      <MenuItem label={t('Move up')} icon="arrow-up" disabled={first} description={first ? t('Already first') : undefined} onSelect={() => onMove(-1)} />
      <MenuItem label={t('Move down')} icon="arrow-down" disabled={last} description={last ? t('Already last') : undefined} onSelect={() => onMove(1)} />
    </Menu>
  )
}

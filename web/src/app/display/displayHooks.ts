// Behaviour shared by the signed-in display and the public link display (OpenSpec
// change display-mode, design D4, D5): root attributes for high contrast and no
// motion, the screen wake lock, and one roving focus across all rows. Kept apart
// from DisplayScreen so the public page does not pull the local database in.
import { useOverlayDepth } from '../../ui'
import { useEffect, useState } from 'react'
import { useShortcutScope } from '../shortcuts'
import { isActivationTarget } from '../shortcuts/dispatch'
import type { DisplayOptions } from './displayOptions'

/** Sets the high-contrast and no-motion attributes on the document root while mounted (design D4). */
export function useRootPresentation(options: Pick<DisplayOptions, 'contrast' | 'motion'>, active = true): void {
  useEffect(() => {
    if (!active) return
    const root = document.documentElement
    if (options.contrast === 'high') root.setAttribute('data-contrast', 'high')
    if (options.motion === 'none') root.setAttribute('data-motion', 'none')
    return () => {
      root.removeAttribute('data-contrast')
      root.removeAttribute('data-motion')
    }
  }, [options.contrast, options.motion, active])
}

/** Keeps the screen awake where the browser supports it; its absence changes nothing. */
export function useWakeLock(active = true): void {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined') return
    const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } }
    if (!nav.wakeLock?.request) return
    let sentinel: { release: () => Promise<void> } | null = null
    let gone = false
    const acquire = () => {
      if (document.visibilityState !== 'visible') return
      nav.wakeLock!.request('screen').then((s) => {
        if (gone) void s.release().catch(() => undefined)
        else sentinel = s
      }).catch(() => undefined)
    }
    acquire()
    document.addEventListener('visibilitychange', acquire)
    return () => {
      gone = true
      document.removeEventListener('visibilitychange', acquire)
      void sentinel?.release().catch(() => undefined)
    }
  }, [active])
}

/**
 * One roving focus across the rows of every group and column (design D5), through
 * the shortcut registry's `display` view scope: arrows and `j`/`k` move, Home and
 * End jump, Space and Enter toggle the focused row, Escape leaves (when `onEscape`
 * is given). The shell's scopes are not mounted, so `g` sequences, `q` and `?` do
 * nothing here. Returns the focused row's key and a setter for focus that arrives
 * by touch or Tab.
 */
export function useDisplayKeys<R extends { key: string }>(rows: readonly R[], onToggle: (row: R) => void, onEscape?: () => void, active = true) {
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const current = rows.some((r) => r.key === focusKey) ? focusKey : rows[0]?.key ?? null
  const overlays = useOverlayDepth()
  const index = Math.max(0, rows.findIndex((r) => r.key === current))
  const move = (to: number): boolean | void => {
    const row = rows[Math.min(rows.length - 1, Math.max(0, to))]
    if (!row) return false
    setFocusKey(row.key)
    document.querySelector<HTMLElement>(`[data-display-row="${CSS.escape(row.key)}"]`)?.focus()
  }
  useShortcutScope('view', {
    'display.down': () => move(index + 1),
    'display.up': () => move(index - 1),
    'display.first': () => move(0),
    'display.last': () => move(rows.length - 1),
    'display.toggle': (e) => {
      // Space and Enter on a control (the checkbox, the menu, Exit) belong to the control.
      const el = e.target as HTMLElement | null
      if (isActivationTarget(el) || (el && el !== document.body && el !== document.documentElement && !el.closest?.('[data-display-row]'))) return false
      const row = rows[index]
      if (!row) return false
      onToggle(row)
    },
    'display.exit': () => {
      if (!onEscape) return false
      onEscape()
    },
  }, { view: 'display', enabled: active, paused: overlays > 0 })

  return { focusKey: current, setFocusKey }
}

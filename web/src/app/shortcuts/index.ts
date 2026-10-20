// Shortcut scopes for React (OpenSpec change ux-overhaul, design D5): the shell
// installs the dispatcher once; views, the panel, the board, the calendar, the
// editor and the Vim layer register their handlers for the registry ids of their
// scope and stop listening to `keydown` themselves.
import { useEffect, useRef } from 'react'
import type { ShortcutScope } from '../../lib/shortcuts'
import { installShortcutDispatcher, registerShortcutScope, type ScopeFrame, type ShortcutHandler } from './dispatch'

export { activeScopes, armGPrefix, clearPrefix, dispatch, hasScope, holdPrefix, installShortcutDispatcher, isActivationTarget, isPrefixPending, isTypingTarget, pendingContinuations, pendingPrefix, registerShortcutScope, resetShortcutScopes, subscribePrefix } from './dispatch'
export type { Continuation, ScopeFrame, ShortcutHandler } from './dispatch'
export { setShortcutHints, useShortcutHints, shortcutHintsOn } from './hints'

export interface ScopeOptions {
  /** The route view, for the `view` scope. */
  view?: string
  /** Only while focus is inside this element. */
  within?: () => Element | null | undefined
  /** Runs before the registry for every key; `true` consumes it. */
  any?: (e: KeyboardEvent) => boolean | void
  /** While true the frame is skipped. */
  paused?: boolean
  /** Consulted before every other frame. */
  capture?: boolean
  /** Unregisters while false. */
  enabled?: boolean
}

/**
 * Registers the handlers of one scope for as long as the component is mounted.
 * Handlers read the latest render through a ref, so the registration happens once
 * per `scope`, `view`, `capture` and `enabled`.
 */
export function useShortcutScope(scope: ShortcutScope, handlers: Partial<Record<string, ShortcutHandler>>, opts: ScopeOptions = {}): void {
  const live = useRef({ handlers, opts })
  live.current = { handlers, opts }
  const { view, capture, enabled = true } = opts
  useEffect(() => {
    if (!enabled) return
    const frame: ScopeFrame = {
      scope,
      view,
      capture,
      // A proxy, so the frame always sees the handlers of the latest render.
      handlers: new Proxy({}, { get: (_, id: string) => live.current.handlers[id], has: (_, id: string) => id in live.current.handlers }),
      // `undefined` when the component set no `within`: the frame is not restricted to an element.
      within: () => (live.current.opts.within ? live.current.opts.within() : undefined),
      any: (e) => live.current.opts.any?.(e),
      paused: () => !!live.current.opts.paused,
    }
    return registerShortcutScope(frame)
  }, [scope, view, capture, enabled])
}

/** Mounted once by the shell: the one `keydown` listener. */
export function useShortcutDispatcher(): void {
  useEffect(() => installShortcutDispatcher(), [])
}

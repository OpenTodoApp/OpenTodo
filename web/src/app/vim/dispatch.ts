// The Vim key dispatcher (OpenSpec `vim-keybindings`, design D2). One capturing
// keydown listener runs it before the default handlers. It consumes only digits
// (count), j/k/arrows after a count, J, K, the second g of gg, G, d, x, o, i, :
// and Escape in a field (help.ts lists the same set for the ? overlay); every
// other event propagates untouched, so the default shortcuts keep working. No DOM
// or React here: VimLayer wires it to the window, tests drive it with plain objects.
import type { ListActions } from '../listActions'
import type { Priority } from '../../lib/types'

export type Mode = 'normal' | 'insert' | 'command'

export interface KeyLike {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  target: EventTarget | null
  preventDefault(): void
  stopPropagation(): void
}

export interface DispatchDeps {
  /** The list on screen (null outside task lists: only `:` and Escape apply there). */
  actions(): ListActions | null
  /** Shell's `g` prefix (signals.ts): `g` then a letter stays Shell's, `g g` is ours. */
  gPending(): boolean
  clearG(): void
  commandOpen(): boolean
  openCommand(): void
  /** `i`: focus the title field of the panel just opened for this task. */
  focusTitle(id: string): void
  /** Pending keys / count for the indicator ('' when none). */
  onPending(pending: string): void
}

const NON_TEXT = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image'])

/** Insert mode: a text entry control has focus (the same set the default handlers treat as typing, minus toggles and buttons). */
export function isTextField(el: EventTarget | Element | null | undefined): boolean {
  const t = el as (HTMLElement & { type?: string }) | null | undefined
  if (!t || typeof t.tagName !== 'string') return false
  if (t.tagName === 'INPUT') return !NON_TEXT.has((t.type ?? 'text').toLowerCase())
  return t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || !!t.isContentEditable
}

/** Fields inside a dialog (pickers, confirmations) keep their own Escape, which closes the dialog. */
function inDialog(el: EventTarget | null): boolean {
  const t = el as Element | null
  return !!t?.closest?.('[role="dialog"], [aria-modal="true"]')
}

export const PENDING_TIMEOUT = 1000

export interface Dispatcher {
  handle(e: KeyLike): boolean
  reset(): void
}

export function createDispatcher(deps: DispatchDeps, timeout = PENDING_TIMEOUT): Dispatcher {
  let count = ''
  let op = ''
  let gShown = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const show = () => deps.onPending(count + op + (gShown ? 'g' : ''))
  const clear = () => {
    count = ''
    op = ''
    gShown = false
    clearTimeout(timer)
    show()
  }
  const arm = (onExpire?: () => void) => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      onExpire?.()
      clear()
    }, timeout)
    show()
  }
  /** A lone 1–4 that no motion claimed is the default priority shortcut. */
  const flushPriority = () => {
    if (!op && !gShown && /^[1-4]$/.test(count)) void deps.actions()?.setPrioritySelected(Number(count) as Priority)
  }
  const consume = (e: KeyLike) => {
    e.preventDefault()
    e.stopPropagation()
    return true
  }

  function handle(e: KeyLike): boolean {
    // The command line handles its own keys (Enter, Tab, Escape).
    if (deps.commandOpen()) return false
    const modified = !!(e.ctrlKey || e.metaKey || e.altKey)
    if (isTextField(e.target)) {
      // Insert mode: only Escape is ours. It leaves the field (which saves on blur)
      // and returns to Normal without the default "close panel" (design D5).
      if (e.key === 'Escape' && !modified && !inDialog(e.target)) {
        ;(e.target as HTMLElement).blur?.()
        clear()
        return consume(e)
      }
      return false
    }
    // Shift alone (for `G`, `J`, Shift+I after `g`) keeps the pending keys.
    if (e.key === 'Shift') return false
    if (modified) {
      flushPriority()
      clear()
      return false
    }
    const actions = deps.actions()
    if (deps.gPending()) {
      if (e.key === 'g') {
        // `gg` (or `Ngg`): ours; Shell's prefix ends here.
        const n = count
        deps.clearG()
        clear()
        if (actions) {
          if (n) actions.selectIndex(Number(n) - 1)
          else actions.selectFirst()
        }
        return consume(e)
      }
      // `g` then any other key is Shell's navigation (g t, g x, g d, …).
      clear()
      return false
    }
    if (e.key === 'g') {
      // First `g`: Shell arms its prefix; a count waits for `Ngg` instead of a priority.
      op = ''
      gShown = true
      arm()
      return false
    }
    if (e.key === ':') {
      clear()
      deps.openCommand()
      return consume(e)
    }
    if (e.key === 'Escape' || !actions) {
      // Escape in Normal mode stays the default (close panel, clear selection).
      clear()
      return false
    }
    if (/^[0-9]$/.test(e.key) && (e.key !== '0' || count)) {
      op = ''
      count += e.key
      arm(flushPriority)
      return consume(e)
    }
    if (op === 'd') {
      const again = e.key === 'd'
      clear()
      if (!again) return false
      void actions.deleteSelected()
      return consume(e)
    }
    const n = count ? Number(count) : 1
    const counted = count !== ''
    switch (e.key) {
      case 'j':
      case 'k':
      case 'ArrowDown':
      case 'ArrowUp':
        // Without a count the default handler moves one row, exactly as before.
        if (!counted) return false
        clear()
        actions.moveSelection(e.key === 'j' || e.key === 'ArrowDown' ? n : -n)
        return consume(e)
      case 'J':
      case 'K':
        clear()
        void actions.moveSelectedBy(e.key === 'J' ? n : -n)
        return consume(e)
      case 'G':
        clear()
        if (counted) actions.selectIndex(n - 1)
        else actions.selectLast()
        return consume(e)
      case 'd':
        count = ''
        op = 'd'
        arm()
        return consume(e)
      case 'x':
        clear()
        void actions.toggleCompleteSelected()
        return consume(e)
      case 'o':
        clear()
        actions.openQuickAdd()
        return consume(e)
      case 'i': {
        clear()
        const id = actions.openSelected()
        if (id) deps.focusTitle(id)
        return consume(e)
      }
    }
    // Any other key: a lone 1–4 sets the priority now, then the key does its usual job.
    flushPriority()
    clear()
    return false
  }

  return { handle, reset: clear }
}

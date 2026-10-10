import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ListActions } from '../listActions'
import { createDispatcher, isTextField, PENDING_TIMEOUT, type KeyLike } from './dispatch'

const body = { tagName: 'BODY' } as unknown as EventTarget

function field(value = '', opts: { dialog?: boolean } = {}) {
  const el = {
    tagName: 'INPUT',
    type: 'text',
    value,
    blurred: false,
    blur() { el.blurred = true },
    closest: (sel: string) => (opts.dialog && sel.includes('dialog') ? {} : null),
  }
  return el
}

/**
 * The dispatcher plus a stand-in for the default layer behind it: Shell's `g`
 * prefix and the list's Escape, digits and j/k. A key reaches the defaults only
 * when the dispatcher did not stop it, exactly as with the capturing listener.
 */
function setup(opts: { list?: boolean } = {}) {
  const calls: string[] = []
  const defaults: string[] = []
  let g = false
  let cmd = false
  const actions: ListActions = {
    moveSelection: (n) => void calls.push(`move ${n}`),
    selectIndex: (i) => void calls.push(`index ${i}`),
    selectFirst: () => void calls.push('first'),
    selectLast: () => void calls.push('last'),
    openSelected: () => (calls.push('open'), 't1'),
    toggleCompleteSelected: async () => void calls.push('toggle'),
    deleteSelected: async () => void calls.push('delete'),
    setPrioritySelected: async (p) => void calls.push(`priority ${p}`),
    moveSelectedBy: async (n) => void calls.push(`moveBy ${n}`),
    openQuickAdd: () => (calls.push('quickadd'), true),
    closePanel: () => void calls.push('close'),
  }
  const pendings: string[] = []
  const d = createDispatcher({
    actions: () => (opts.list === false ? null : actions),
    gPending: () => g,
    clearG: () => (g = false),
    commandOpen: () => cmd,
    openCommand: () => {
      cmd = true
      calls.push('command')
    },
    focusTitle: (id) => void calls.push(`focus ${id}`),
    onPending: (p) => void pendings.push(p),
  })
  function press(key: string, target: EventTarget = body, mods: Partial<KeyLike> = {}) {
    const e = { key, target, prevented: false, stopped: false, preventDefault() { e.prevented = true }, stopPropagation() { e.stopped = true }, ...mods }
    d.handle(e)
    if (!e.stopped) {
      defaults.push(key)
      // Default layer (Shell + TaskListView), heavily simplified.
      if (isTextField(target)) {
        if (key === 'Escape') (target as unknown as { blur(): void }).blur()
      } else if (key === 'g' && !g) g = true
      else if (g) {
        g = false
        if (key === 't') calls.push('nav today')
      } else if (/^[1-4]$/.test(key)) calls.push(`priority ${key}`)
      else if (key === 'Escape') calls.push('default escape')
      else if (key === 'j') calls.push('move 1')
    }
    return e
  }
  return { press, calls, defaults, pendings, closeCommand: () => (cmd = false) }
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('vim dispatcher', () => {
  it('gg selects first', () => {
    const { press, calls } = setup()
    press('g')
    press('g')
    expect(calls).toEqual(['first'])
  })

  it('G selects last', () => {
    const { press, calls } = setup()
    expect(press('G').stopped).toBe(true)
    expect(calls).toEqual(['last'])
  })

  it('a count before gg or G selects that task', () => {
    const { press, calls } = setup()
    press('4')
    press('g')
    press('g')
    press('2')
    press('G')
    vi.advanceTimersByTime(PENDING_TIMEOUT * 2)
    expect(calls).toEqual(['index 3', 'index 1'])
  })

  it('3j moves three', () => {
    const { press, calls, defaults } = setup()
    press('3')
    press('j')
    expect(calls).toEqual(['move 3'])
    expect(defaults).toEqual([])
    press('1')
    press('2')
    press('k')
    expect(calls).toEqual(['move 3', 'move -12'])
  })

  it('j without a count is left to the default handler', () => {
    const { press, calls, defaults } = setup()
    expect(press('j').stopped).toBe(false)
    expect(defaults).toEqual(['j'])
    expect(calls).toEqual(['move 1'])
  })

  it('dd deletes', () => {
    const { press, calls } = setup()
    press('d')
    press('d')
    expect(calls).toEqual(['delete'])
  })

  it('d then timeout does nothing', () => {
    const { press, calls, pendings } = setup()
    press('d')
    expect(pendings.at(-1)).toBe('d')
    vi.advanceTimersByTime(PENDING_TIMEOUT + 1)
    press('d')
    vi.advanceTimersByTime(PENDING_TIMEOUT + 1)
    expect(calls).toEqual([])
    expect(pendings.at(-1)).toBe('')
  })

  it('2 then timeout sets priority 2', () => {
    const { press, calls, defaults } = setup()
    expect(press('2').stopped).toBe(true)
    expect(calls).toEqual([])
    vi.advanceTimersByTime(PENDING_TIMEOUT + 1)
    expect(calls).toEqual(['priority 2'])
    expect(defaults).toEqual([])
  })

  it('2j is a count, 2 alone a priority', () => {
    const a = setup()
    a.press('2')
    a.press('j')
    vi.advanceTimersByTime(PENDING_TIMEOUT + 1)
    expect(a.calls).toEqual(['move 2'])
    const b = setup()
    b.press('2')
    vi.advanceTimersByTime(PENDING_TIMEOUT + 1)
    expect(b.calls).toEqual(['priority 2'])
  })

  it('a digit followed by another key sets the priority at once and the key still works', () => {
    const { press, calls, defaults } = setup()
    press('3')
    press('Escape')
    expect(calls).toEqual(['default escape'])
    press('3')
    press('c')
    expect(calls).toEqual(['default escape', 'priority 3'])
    expect(defaults).toEqual(['Escape', 'c'])
  })

  it('x toggles completion', () => {
    const { press, calls } = setup()
    press('x')
    expect(calls).toEqual(['toggle'])
  })

  it('o opens quick add', () => {
    const { press, calls } = setup()
    const e = press('o')
    expect(calls).toEqual(['quickadd'])
    // The letter must not land in the field that just took focus.
    expect(e.prevented).toBe(true)
  })

  it('i opens panel', () => {
    const { press, calls } = setup()
    expect(press('i').prevented).toBe(true)
    expect(calls).toEqual(['open', 'focus t1'])
  })

  it('J / K move the selected task, with a count', () => {
    const { press, calls } = setup()
    press('J')
    press('3')
    press('K')
    expect(calls).toEqual(['moveBy 1', 'moveBy -3'])
  })

  it('keys in Insert are not intercepted', () => {
    const { press, calls, defaults } = setup()
    const input = field()
    for (const k of ['d', 'd', '3', 'j', 'g', 'g', 'x', 'o', 'i', ':', 'G']) expect(press(k, input as unknown as EventTarget).stopped).toBe(false)
    vi.advanceTimersByTime(PENDING_TIMEOUT + 1)
    expect(calls).toEqual([])
    expect(defaults).toHaveLength(11)
  })

  it('non-Vim keys propagate', () => {
    const { press, defaults } = setup()
    const keys = ['q', 'c', 'a', 'A', 'L', 'e', 's', 'S', 'O', 'v', 'h', 'l', 'm', 'z', 'Enter', 'Delete', 'Tab', '?', 'ArrowLeft', 'Escape']
    for (const k of keys) expect(press(k).stopped).toBe(false)
    expect(press('ArrowUp', body, { altKey: true }).stopped).toBe(false)
    expect(press('C', body, { shiftKey: true } as Partial<KeyLike>).stopped).toBe(false)
    expect(defaults).toEqual([...keys, 'ArrowUp', 'C'])
  })

  it('g t keeps navigating, in either order with g g', () => {
    const a = setup()
    a.press('g')
    a.press('t')
    a.press('g')
    a.press('g')
    expect(a.calls).toEqual(['nav today', 'first'])
    const b = setup()
    b.press('g')
    b.press('g')
    b.press('g')
    b.press('t')
    expect(b.calls).toEqual(['first', 'nav today'])
  })

  it('g then x, d, s stays Shell navigation', () => {
    const { press, defaults } = setup()
    for (const k of ['x', 'd', 's']) {
      press('g')
      expect(press(k).stopped).toBe(false)
    }
    expect(defaults).toEqual(['g', 'x', 'g', 'd', 'g', 's'])
  })

  it('outside task lists only : is taken', () => {
    const { press, calls, defaults } = setup({ list: false })
    for (const k of ['d', 'd', '2', 'x', 'G', 'o']) expect(press(k).stopped).toBe(false)
    expect(press(':').stopped).toBe(true)
    // `2` reached the default priority shortcut directly.
    expect(calls).toEqual(['priority 2', 'command'])
    expect(defaults).toEqual(['d', 'd', '2', 'x', 'G', 'o'])
  })

  it('leaves keys to the command line while it is open', () => {
    const { press, calls } = setup()
    press(':')
    const line = field()
    expect(press('d', line as unknown as EventTarget).stopped).toBe(false)
    expect(press('Escape', line as unknown as EventTarget).stopped).toBe(false)
    expect(press('x').stopped).toBe(false)
    expect(calls).toEqual(['command'])
  })

  it('escape in field returns to Normal and keeps value', () => {
    const { press, calls } = setup()
    const input = field('Buy milk')
    const e = press('Escape', input as unknown as EventTarget)
    expect(e.stopped).toBe(true)
    expect(input.blurred).toBe(true)
    expect(input.value).toBe('Buy milk')
    // The default Escape (close panel) did not run.
    expect(calls).toEqual([])
  })

  it('second escape reaches default handler', () => {
    const { press, calls, defaults } = setup()
    const input = field('x')
    press('Escape', input as unknown as EventTarget)
    // Focus is on the page now: the next Escape is the default one.
    expect(press('Escape').stopped).toBe(false)
    expect(defaults).toEqual(['Escape'])
    expect(calls).toEqual(['default escape'])
  })

  it('a field inside a dialog keeps its own Escape', () => {
    const { press } = setup()
    const input = field('', { dialog: true })
    expect(press('Escape', input as unknown as EventTarget).stopped).toBe(false)
  })

  it('treats checkboxes and buttons as Normal mode, text controls as Insert', () => {
    expect(isTextField({ tagName: 'INPUT', type: 'checkbox' } as unknown as EventTarget)).toBe(false)
    expect(isTextField({ tagName: 'BUTTON' } as unknown as EventTarget)).toBe(false)
    expect(isTextField({ tagName: 'INPUT', type: 'search' } as unknown as EventTarget)).toBe(true)
    expect(isTextField({ tagName: 'TEXTAREA' } as unknown as EventTarget)).toBe(true)
    expect(isTextField({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget)).toBe(true)
    expect(isTextField(null)).toBe(false)
  })
})

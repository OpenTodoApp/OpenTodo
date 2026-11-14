// @vitest-environment happy-dom
// Focus on open and the on-screen keyboard (OpenSpec change touch-sheet-focus): the
// overlay's one rule. On a device without a keyboard a text field takes focus on open
// only when it asks for it; otherwise focus rests on the panel.
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { KEYBOARD_LIKELY } from '../../lib/keyboardLikely'
import { key, render, waitFor } from '../test-utils'
import { Dialog } from './Dialog'
import { pickerField } from './stack'

function device(touch: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === KEYBOARD_LIKELY ? !touch : false, media: q, addEventListener() {}, removeEventListener() {} }))
}
afterEach(() => { vi.unstubAllGlobals() })

const panel = () => document.querySelector<HTMLElement>('[data-overlay="dialog"]')
async function open(children: ReactNode) {
  const r = await render(<Dialog title="Sheet" onClose={() => {}}>{children}</Dialog>)
  await waitFor(() => !!panel() && panel()!.contains(document.activeElement), 'focus inside the dialog')
  return r
}
const named = (name: string) => document.querySelector<HTMLElement>(`[aria-label="${name}"]`)

describe('focus on open, touch only', () => {
  it('a field that is merely first leaves focus on the panel, and Tab reaches it first', async () => {
    device(true)
    const { unmount } = await open(<><input aria-label="Token" /><button>Save</button></>)
    expect(document.activeElement).toBe(panel())
    await key(panel()!, 'Tab')
    expect(document.activeElement).toBe(named('Token'))
    await unmount()
  })

  it('a picker field leaves focus on the panel', async () => {
    device(true)
    const { unmount } = await open(<><input aria-label="Find" {...pickerField()} /><button>One</button></>)
    expect(document.activeElement).toBe(panel())
    await unmount()
  })

  it('a field that asks for focus gets it: autoFocus and data-autofocus', async () => {
    device(true)
    const a = await open(<input aria-label="Name" autoFocus />)
    expect(document.activeElement).toBe(named('Name'))
    await a.unmount()
    const b = await open(<><button>First</button><textarea aria-label="Comment" data-autofocus /></>)
    expect(document.activeElement).toBe(named('Comment'))
    await b.unmount()
  })

  it('a button first is focused as before', async () => {
    device(true)
    const { unmount } = await open(<><button aria-label="Today">Today</button><input aria-label="Date" /></>)
    expect(document.activeElement).toBe(named('Today'))
    await unmount()
  })
})

describe('focus on open, with a keyboard', () => {
  it('the first field and a picker field are focused as before', async () => {
    device(false)
    const a = await open(<><input aria-label="Token" /><button>Save</button></>)
    expect(document.activeElement).toBe(named('Token'))
    await a.unmount()
    const b = await open(<><button>First</button><input aria-label="Find" {...pickerField()} /></>)
    expect(document.activeElement).toBe(named('Find'))
    await b.unmount()
  })
})

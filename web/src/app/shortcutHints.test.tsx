// @vitest-environment happy-dom
// "Show shortcut hints" (OpenSpec change ux-overhaul, keyboard-shortcuts "Shortcut
// hints live in tooltips and menus"): with the preference off no key badge is
// printed in the chrome (quick add, the sidebar's destinations, prompts); on, quick
// add shows its `q` and the sidebar destinations their `g` keys, on this device only.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { User } from '../lib/types'
import { flush, render } from '../ui/test-utils'
import { QuickAdd } from './QuickAdd'
import { Kbd } from './shortcuts/Kbd'
import { HINTS_KEY, setShortcutHints, shortcutHintsOn } from './shortcuts/hints'
import { Sidebar } from './Sidebar'
import { KeyboardView } from './PreferencesPanels'

const user: User = { id: 'u1', email: 'sam@example.com', name: 'Sam', role: 'member', createdAt: 1 }

beforeEach(() => { localStorage.removeItem(HINTS_KEY) })
afterEach(() => { document.body.innerHTML = ''; localStorage.removeItem(HINTS_KEY) })

describe('hints off (the default)', () => {
  it('quick add prints no key badge, and Kbd renders plain text or nothing', async () => {
    expect(shortcutHintsOn()).toBe(false)
    const r = await render(<><QuickAdd placeholder="Add a task" onAdd={async () => {}} /><p data-plain><Kbd k="Enter" /></p><p data-only><Kbd k="Esc" only /></p></>)
    await flush()
    expect(r.container.querySelector('kbd, .kbd')).toBeNull()
    expect(r.container.querySelector('[data-plain]')?.textContent).toBe('Enter')
    expect(r.container.querySelector('[data-only]')?.textContent).toBe('')
    await r.unmount()
  })

  it('the sidebar destinations carry no key badges', async () => {
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await flush(50)
    expect(r.container.querySelector('[data-go-hint]')).toBeNull()
    expect(r.container.querySelector('nav .kbd, nav kbd')).toBeNull()
    await r.unmount()
  })
})

describe('hints on', () => {
  it('quick add shows its q again and the destinations show their g keys', async () => {
    setShortcutHints(true)
    const r = await render(<><QuickAdd placeholder="Add a task" onAdd={async () => {}} /><Sidebar route={{ view: 'inbox' }} user={user} /></>)
    await flush(50)
    expect(r.container.querySelector('[data-quick-add-hint]')?.textContent).toBe('q')
    const hints = [...r.container.querySelectorAll('[data-go-hint]')].map((k) => k.textContent)
    expect(hints).toContain('g i')
    expect(hints).toContain('g t')
    await r.unmount()
  })

  it('is a device preference in Settings → General → Keyboard, stored locally', async () => {
    let on = false
    const r = await render(<KeyboardView vim={false} onVim={() => {}} hints={on} onHints={(v) => { on = v; setShortcutHints(v) }} />)
    await flush()
    const sw = r.container.querySelector<HTMLElement>('[data-hints-switch] [role="switch"]')!
    expect(sw.getAttribute('aria-checked')).toBe('false')
    sw.click()
    await flush()
    expect(on).toBe(true)
    expect(localStorage.getItem(HINTS_KEY)).toBe('1')
    await r.unmount()
  })
})

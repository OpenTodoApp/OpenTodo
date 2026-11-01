// @vitest-environment happy-dom
// The VS Code import report (OpenSpec change theme-editor, task 5.3, design D12):
// mapped tokens with their keys, derived and ignored keys, failing pairs with Fix
// contrast now preselected, the include note and the licence advice; and the
// import from Settings opens an unsaved draft without any request.
import 'fake-indexeddb/auto'
import { Suspense } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { resetDeviceId } from '../../lib/ops'
import { checkTheme } from '../../lib/theme/check'
import { deriveTheme } from '../../lib/theme/derive'
import { readDraft } from '../../lib/theme/draft'
import { importVsCodeTheme } from '../../lib/theme/vscode'
import dark from '../../lib/theme/testdata/vscode/dark.json?raw'
import include from '../../lib/theme/testdata/vscode/include.json?raw'
import { click, render, waitFor } from '../../ui/test-utils'
import { AppearanceSection } from '../AppearanceSection'
import { navigate } from '../router'
import { ImportReport } from './ImportReport'

let requests = 0
beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  localStorage.clear()
  navigate({ view: 'settings', section: 'appearance', page: 'theme' })
  requests = 0
  vi.stubGlobal('fetch', vi.fn(async () => { requests++; return new Response('{}', { status: 404 }) }))
})
afterEach(() => vi.unstubAllGlobals())

const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)

describe('the import report', () => {
  it('lists what was mapped, derived and ignored, preselects Fix contrast now and advises on the licence', async () => {
    const r0 = importVsCodeTheme(include)
    if (!r0.ok) throw new Error(r0.message)
    // A failing pair, so the fix choice shows.
    const failures = checkTheme(deriveTheme({ ...r0.doc, tokens: { muted: '#f0f0f0' } }))
    let opened: boolean | null = null
    const r = await render(<Suspense fallback={null}><ImportReport report={r0.report} failures={failures} onCancel={() => {}} onOpen={(fix) => { opened = fix }} /></Suspense>)
    await waitFor(() => !!document.querySelector('[data-vscode-open]'), 'the report')
    expect(q('[data-vscode-target="accent"]')!.textContent).toContain('button.background')
    expect(document.body.textContent).toContain('The file includes ./base.json, which was not read')
    expect(document.body.textContent).toContain('Check the theme\'s licence before you share this file.')
    expect(q<HTMLInputElement>('[data-vscode-fix]')!.checked).toBe(true)
    await click(q('[data-vscode-open]')!)
    expect(opened).toBe(true)
    await r.unmount()
  })

  it('importing a VS Code theme from Settings shows the report, then opens an unsaved draft', async () => {
    const r = await render(<AppearanceSection />)
    await waitFor(() => !!q('[data-theme-vscode-file]'), 'the file input')
    const input = q<HTMLInputElement>('[data-theme-vscode-file]')!
    const file = new File([dark], 'harbour-night-color-theme.json', { type: 'application/json' })
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await waitFor(() => !!q('[data-vscode-report]'), 'the report')
    expect(q('[data-vscode-target="canvas"]')!.textContent).toContain('sideBar.background')
    await waitFor(() => !!q('[data-vscode-open]') && !document.body.textContent!.includes('Measuring…'), 'the contrast measured', 20_000)
    await click(q('[data-vscode-open]')!)
    await waitFor(() => location.pathname.startsWith('/settings/appearance/themes/'), 'the editor', 20_000)
    const draft = readDraft(location.pathname.split('/').pop()!)!
    expect(draft.doc).toMatchObject({ name: 'Harbour Night', kind: 'dark', licence: 'unknown' })
    expect(await db.outbox.count()).toBe(0)
    expect(requests).toBe(0)
    await r.unmount()
  })
})

// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useDatabase } from '../../lib/db'
import { closeHelp, useHelpRequest } from '../../lib/helpRequest'
import { setMethodMode } from '../../lib/method/mode'
import { resetDeviceId } from '../../lib/ops'
import { PageHeader } from '../../ui'
import { click, flush, render } from '../../ui/test-utils'
import type { ReactNode } from 'react'
import type { MoveId } from '../../lib/method'
import { METHOD_HELP_SCREENS, useWithMethod } from './MethodLink'

function WithMethod({ move, children }: { move: MoveId; children?: ReactNode }) {
  return <>{useWithMethod(move, children)}</>
}
function Header() {
  return <PageHeader title="Inbox" help="inbox" meta={useWithMethod('catch')} subtitle={useWithMethod('catch')} />
}

let n = 0
beforeEach(() => {
  useDatabase(`method-link-${Date.now()}-${n++}`)
  resetDeviceId()
})
afterEach(() => { closeHelp(); document.body.innerHTML = '' })

async function waitFor(ok: () => boolean, ms = 2000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}

let opened: string | null = null
function HelpSpy() {
  opened = useHelpRequest()?.screen ?? null
  return null
}

const Inbox = () => (
  <>
    <Header />
    <HelpSpy />
  </>
)

describe('References to the method (open-loops)', () => {
  it('Companion user on the Inbox: "Catch · Open Loops" opens the Catch page in the Help panel', async () => {
    await setMethodMode('companion')
    const r = await render(<Inbox />)
    await waitFor(() => !!r.container.querySelector('[data-method-link]'))
    const link = r.container.querySelector<HTMLButtonElement>('[data-method-link="catch"]')!
    expect(link.textContent).toBe('Catch·Open Loops: open the method guide')
    expect(link.getAttribute('aria-label')).toBeNull()
    await click(link)
    expect(opened).toBe('method/catch')
    expect(r.container.querySelector('[data-page-title]')?.textContent).toBe('Inbox')
    await r.unmount()
  })

  it('Lists only: no method link, the header is as before', async () => {
    const plain = await render(<PageHeader title="Inbox" help="inbox" />)
    const before = plain.container.innerHTML
    await plain.unmount()
    const r = await render(<Header />)
    await flush(50)
    expect(r.container.querySelector('[data-method-link]')).toBeNull()
    expect(r.container.innerHTML).toBe(before)
    await r.unmount()
  })

  it('keeps the existing meta text before the link', async () => {
    await setMethodMode('first')
    const r = await render(<WithMethod move="clarify"><span data-progress>4 of 17</span></WithMethod>)
    await waitFor(() => !!r.container.querySelector('[data-method-link="clarify"]'))
    expect(r.container.textContent).toMatch(/^4 of 17·Clarify·Open Loops: open the method guide$/)
    await r.unmount()
  })

  it('names a Help screen for every move and the overview', () => {
    expect(Object.values(METHOD_HELP_SCREENS)).toEqual(['method/overview', 'method/catch', 'method/clarify', 'method/place', 'method/do', 'method/review'])
  })
})

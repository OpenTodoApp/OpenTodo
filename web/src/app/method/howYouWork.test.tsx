// @vitest-environment happy-dom
// How you work (OpenSpec change open-loops-method, tasks 6.1 and 6.4).
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from '../../lib/db'
import { closeHelp, useHelpRequest } from '../../lib/helpRequest'
import { createLabel } from '../../lib/labels'
import { readMethodMode, setMethodMode } from '../../lib/method/mode'
import { createProject, createTask, resetDeviceId } from '../../lib/ops'
import { getStartView } from '../../lib/views'
import { click, flush, render } from '../../ui/test-utils'
import { HowYouWorkSection } from './HowYouWorkSection'

let n = 0
beforeEach(() => {
  useDatabase(`how-you-work-${Date.now()}-${n++}`)
  resetDeviceId()
})
afterEach(() => { closeHelp(); document.body.innerHTML = '' })

async function waitFor(ok: () => boolean, ms = 2000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}
let opened: string | null = null
function Spy() { opened = useHelpRequest()?.screen ?? null; return null }
const radio = (mode: string) => document.querySelector<HTMLButtonElement>(`[data-method-mode="${mode}"]`)!
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === label)!

describe('Choosing how you work', () => {
  it('Pick Open Loops first and accept the Loop home: this device opens on it', async () => {
    const r = await render(<HowYouWorkSection />)
    await waitFor(() => radio('lists')?.getAttribute('aria-checked') === 'true')
    await click(radio('first'))
    await waitFor(() => radio('first').getAttribute('aria-checked') === 'true')
    expect(readMethodMode(await db.userPrefs.get('me'))).toBe('first')
    await click(button('Open on the Loop home'))
    await waitFor(() => document.body.textContent!.includes('This device now opens on the Loop home.'))
    expect(await getStartView()).toBe('loop')
    await r.unmount()
  })

  it('Learn before choosing opens the method overview in Help and changes nothing', async () => {
    const r = await render(<><HowYouWorkSection /><Spy /></>)
    await waitFor(() => !!document.querySelector('[data-learn-method]'))
    await click(document.querySelector('[data-learn-method]')!)
    expect(opened).toBe('method/overview')
    expect(await db.userPrefs.get('me')).toBeUndefined()
    await r.unmount()
  })

  it('Accept the starter labels: four contexts, skipping none when "home" has no @', async () => {
    await createLabel({ name: 'home' })
    const r = await render(<HowYouWorkSection />)
    await waitFor(() => !!radio('companion'))
    await click(radio('companion'))
    await waitFor(() => !!document.querySelector('[data-offer="contexts"]'))
    expect(document.querySelector('[data-offer="start"]')).toBeNull()
    await click(button('Create them'))
    await waitFor(() => !document.querySelector('[data-offer="contexts"]'))
    const names = (await db.labels.toArray()).map((l) => l.name).sort()
    expect(names).toEqual(['@calls', '@computer', '@errands', '@home', 'home'])
    expect((await db.outbox.toArray()).filter((o) => o.entity === 'label' && o.field === 'name')).toHaveLength(5)
    await r.unmount()
  })

  it('Contexts already exist: no starter offer', async () => {
    await createLabel({ name: '@office' })
    const r = await render(<HowYouWorkSection />)
    await waitFor(() => !!radio('first'))
    await flush(50)
    await click(radio('first'))
    await waitFor(() => !!document.querySelector('[data-offer="start"]'))
    expect(document.querySelector('[data-offer="contexts"]')).toBeNull()
    await r.unmount()
  })
})

describe('The mode is presentation only (open-loops "How you work preference")', () => {
  it('Switching back loses nothing: each switch writes one user_prefs op and nothing else', async () => {
    const project = await createProject({ name: 'Garage' })
    await createTask({ title: 'Measure wall', project_id: project })
    await db.outbox.clear()
    for (const mode of ['companion', 'first', 'lists'] as const) await setMethodMode(mode)
    const ops = (await db.outbox.toArray()).map((o) => [o.entity, o.field, o.value])
    expect(ops).toEqual([['user_prefs', 'method_mode', 'companion'], ['user_prefs', 'method_mode', 'first'], ['user_prefs', 'method_mode', 'lists']])
    expect((await db.tasks.toArray()).map((x) => x.title)).toEqual(['Measure wall'])
  })
})

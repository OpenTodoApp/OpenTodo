// @vitest-environment happy-dom
// The Android quick-add notification (OpenSpec change android-quick-add-notification):
// the switch through the bridge (D2), no inline field for an encrypted account (D3),
// a reply saved as a task only in a background run (D4), and the Settings card.
import 'fake-indexeddb/auto'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db, setMeta } from '../lib/db'
import { publishEncryption } from '../lib/e2ee'
import { resetDeviceId } from '../lib/ops'
import { forgetShellData, type OpenTodoShell } from '../lib/shell'
import { handleShellUrl, reminderActionsApplied } from '../lib/shellActions'
import { startBackgroundRun } from '../lib/shellBackground'
import { applyNotificationAdd, quickAddNotificationState, setQuickAddNotification, syncQuickAddReply } from '../lib/shellQuickAdd'
import { setCurrentUserId } from '../lib/sharing'
import { QuickAddNotificationSection, QuickAddNotificationView } from './QuickAddNotificationSettings'
import { render, waitFor } from '../ui/test-utils'

const calls: string[] = []
let answer = 'on'
const shellWith = (capabilities: string[]): OpenTodoShell => (window.opentodoShell = {
  bridge: 1, platform: 'android', app: '1.8.0', capabilities,
  quickAddNotification: (json: string) => { calls.push(json); return answer },
})
const hist = { state: null, replaceState: () => undefined } as unknown as History
const at = (search: string) => ({ pathname: '/', search, hash: '' }) as Location
const live = async () => (await db.tasks.toArray()).filter((t) => !t.deleted_at)

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  await setCurrentUserId('u1')
  calls.length = 0
  answer = 'on'
})
afterEach(() => {
  delete window.opentodoShell
  publishEncryption({ enabled: false })
})

describe('the switch through the bridge', () => {
  it('reads and sets the state with reply, and turns it off on sign-out', async () => {
    shellWith(['quick-add-notification', 'links'])
    expect(await quickAddNotificationState()).toBe('on')
    answer = 'denied'
    expect(await setQuickAddNotification(true)).toBe('denied')
    answer = 'something else'
    expect(await setQuickAddNotification(false)).toBe('off')
    forgetShellData()
    expect(calls).toEqual(['{"reply":true}', '{"on":true,"reply":true}', '{"on":false,"reply":true}', '{"on":false,"reply":false}'])
  })

  it('offers no inline field for an encrypted account, and hands the change over once', async () => {
    shellWith(['quick-add-notification'])
    await quickAddNotificationState()
    syncQuickAddReply()
    publishEncryption({ enabled: true })
    syncQuickAddReply()
    syncQuickAddReply()
    expect(calls).toEqual(['{"reply":true}', '{"reply":false}'])
  })

  it('does nothing in a shell without the capability', async () => {
    shellWith(['reminders'])
    expect(await setQuickAddNotification(true)).toBeNull()
    syncQuickAddReply()
    forgetShellData()
    expect(calls).toEqual([])
  })
})

describe('a reply in a background run', () => {
  it('saves the line as a task read with quick-add syntax, in the Inbox', async () => {
    shellWith(['reminders', 'background'])
    const before = reminderActionsApplied()
    expect(await handleShellUrl(() => false, at('?add=Buy+milk+p1'), hist)).toEqual({ kind: 'add', text: 'Buy milk p1' })
    const [task] = await live()
    expect(task).toMatchObject({ title: 'Buy milk', priority: 1, project_id: null })
    expect(await db.outbox.count()).toBeGreaterThan(0)
    expect(reminderActionsApplied()).toBe(before + 1)
  })

  it('goes to a typed project', async () => {
    const { createProject } = await import('../lib/ops')
    const home = await createProject({ name: 'Home' })
    expect(await applyNotificationAdd('Call the plumber #Home')).not.toBeNull()
    expect((await live())[0]).toMatchObject({ title: 'Call the plumber', project_id: home })
  })

  it('saves nothing for an empty line, signed out, or an encrypted account', async () => {
    expect(await applyNotificationAdd('   ')).toBeNull()
    await setMeta('e2ee.enabled', true)
    expect(await applyNotificationAdd('Secret')).toBeNull()
    await setMeta('e2ee.enabled', false)
    await setMeta('userId', null)
    expect(await applyNotificationAdd('Nobody')).toBeNull()
    expect(await live()).toEqual([])
  })

  it('the visible app only prefills', async () => {
    shellWith(['reminders', 'links'])
    let opened = 0
    await handleShellUrl(() => { opened++; return true }, at('?add=Buy+milk'), hist)
    expect(opened).toBe(1)
    expect(await live()).toEqual([])
  })

  it('the run waits for the reply to be saved', async () => {
    shellWith(['reminders', 'background'])
    let done = false
    window.opentodoShell!.backgroundDone = () => { done = true }
    // The clock stands still until the reply is saved: only the pending add holds the run.
    let t = 0, polls = 0, saved = false
    const run = startBackgroundRun({ now: () => t, sleep: async (ms) => { polls++; if (saved) t += ms; await Promise.resolve() }, search: '?add=Buy+milk' })
    await waitFor(() => polls > 3, 'the run polling')
    expect(done).toBe(false)
    await handleShellUrl(() => false, at('?add=Buy+milk'), hist)
    saved = true
    await run
    expect(done).toBe(true)
    expect(t).toBeLessThan(45_000)
  })
})

describe('Settings card', () => {
  it('shows only where the shell offers it, and a refusal leaves it off with a notice', async () => {
    shellWith(['reminders'])
    expect(renderToStaticMarkup(<QuickAddNotificationSection />)).toBe('')
    const off = renderToStaticMarkup(<QuickAddNotificationView state="denied" busy={false} onToggle={() => {}} />)
    expect(off).toContain('Quick add notification')
    expect(off).toContain('Android refused notifications for OpenTodo')
    expect(off).toContain('aria-checked="false"')
    const on = renderToStaticMarkup(<QuickAddNotificationView state="on" busy={false} onToggle={() => {}} />)
    expect(on).toContain('aria-checked="true"')
    expect(on).not.toContain('Android refused')
  })

  it('reads the phone\'s state', async () => {
    shellWith(['quick-add-notification', 'links'])
    const { container, unmount } = await render(<QuickAddNotificationSection />)
    await waitFor(() => container.querySelector('[aria-checked="true"]') != null, 'the switch on')
    expect(calls).toEqual(['{"reply":true}'])
    unmount()
  })
})

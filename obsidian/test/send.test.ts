// @vitest-environment happy-dom
// Specs "Send a line or a selection to OpenTodo", "The task links back to its
// note", "Sends work offline" and "The plugin on an encrypted account", through
// the loaded plugin, the real sheet and a fake server.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createKeyRecord, ITERATION_LIMITS, isEnvelope } from '../../web/src/lib/crypto'
import { openValue } from '../../web/src/lib/e2eeEnvelope'
import { obsidianURL } from '../../web/src/lib/taskOrigin'
import { connected, memoryEditor, until } from './harness'
import { notices, TFile } from './obsidian'

const NOTE = 'Daily/2026-10-29.md'

/** The open sheet, or null. */
const sheet = () => document.querySelector<HTMLElement>('.opentodo-sheet')
const key = (el: Element, k: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))

async function send(h: Awaited<ReturnType<typeof connected>>, ed: ReturnType<typeof memoryEditor>, from: number, to = from, act: (s: HTMLElement) => void = (s) => key(s.querySelector('input')!, 'Enter')) {
  const p = h.plugin.sender.sendLines(ed, NOTE, from, to)
  if (!h.plugin.settings.sendWithoutAsking) {
    await until(() => sheet() !== null || notices.length > 0)
    const s = sheet()
    if (s) act(s)
  }
  return p
}

function notice(re: RegExp) {
  return notices.find((n) => re.test(n.message))
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-29T08:00:00') })
  document.body.replaceChildren()
})
afterEach(() => vi.useRealTimers())

describe('sending', () => {
  it('A plain line from a daily note becomes a task in the Inbox', async () => {
    const h = await connected()
    const ed = memoryEditor('# Thursday\nCall the plumber tomorrow 9am p2\n')
    const [id] = await send(h, ed, 1)
    await until(() => h.server.tasks().length === 1)
    const task = h.server.tasks()[0]
    expect(task).toMatchObject({ id, title: 'Call the plumber', due: { date: '2026-10-30', time: '09:00' }, priority: 2, project_id: null })
    // The origin opens the note, by the obsidian-origin rules.
    const origin = task.origin as { kind: string; id: string; url: string; title: string }
    expect(origin).toMatchObject({ kind: 'obsidian', id: NOTE, title: '2026-10-29' })
    expect(obsidianURL(origin.url, origin.id)).toEqual({ vault: 'Work notes', file: NOTE })
    // The line keeps its text and links to the task.
    expect(ed.getLine(1)).toBe(`Call the plumber tomorrow 9am p2 [opentodo:: https://todo.example.com/?task=${id}]`)
    expect(h.server.pushes.every((p) => p.features.includes('push_only') && p.device === h.plugin.device && p.device.startsWith('obsidian:'))).toBe(true)
  })

  it('A Tasks line: the sheet shows what was recognised, and sending creates that task', async () => {
    const h = await connected()
    h.server.labels = [{ id: 'l-errand', name: 'errand', position: 1 }]
    await h.plugin.refreshLists(true)
    const ed = memoryEditor('- [ ] Renew passport 📅 2026-11-05 ⏫ #errand')
    let chips: string[] = []
    let title = ''
    await send(h, ed, 0, 0, (s) => {
      title = s.querySelector<HTMLInputElement>('.opentodo-sheet-title')!.value
      chips = [...s.querySelectorAll('.opentodo-chip')].map((c) => c.textContent ?? '')
      key(s.querySelector('input')!, 'Enter')
    })
    expect(title).toBe('Renew passport')
    expect(chips).toEqual(['Due 2026-11-05', 'Priority 2', 'Label errand'])
    await until(() => h.server.tasks().length === 1)
    expect(h.server.tasks()[0]).toMatchObject({ title: 'Renew passport', due: { date: '2026-11-05' }, priority: 2, labels: ['l-errand'] })
    // No new label: the existing one matched.
    expect([...h.server.ops.values()].some((o) => o.entity === 'label')).toBe(false)
  })

  it('A selection of three lines with the second unticked creates two tasks and changes two lines', async () => {
    const h = await connected()
    const ed = memoryEditor('Buy milk\nCall Bob\nWater plants')
    const ids = await send(h, ed, 0, 2, (s) => {
      const boxes = s.querySelectorAll<HTMLInputElement>('input[type=checkbox]')
      expect(boxes.length).toBe(3)
      boxes[1].checked = false
      boxes[1].dispatchEvent(new Event('change'))
      key(boxes[0], 'Enter')
    })
    expect(ids.length).toBe(2)
    await until(() => h.server.tasks().length === 2)
    expect(h.server.tasks().map((t) => t.title).sort()).toEqual(['Buy milk', 'Water plants'])
    expect(ed.getLine(1)).toBe('Call Bob')
    expect(ed.getLine(0)).toMatch(/\[opentodo:: /)
    expect(ed.getLine(2)).toMatch(/\[opentodo:: /)
  })

  it('Already sent: nothing is sent and the notice offers Open in OpenTodo', async () => {
    const h = await connected()
    const ed = memoryEditor('Call Bob [opentodo:: https://todo.example.com/?task=8c2a]')
    const opened: string[] = []
    window.open = ((u: string) => opened.push(u)) as never
    expect(await h.plugin.sender.sendLines(ed, NOTE, 0, 0)).toEqual([])
    expect(sheet()).toBeNull()
    const n = notice(/already in OpenTodo/)!
    expect(n).toBeDefined()
    n.el.querySelector('button')!.dispatchEvent(new MouseEvent('click'))
    expect(opened).toEqual(['https://todo.example.com/?task=8c2a'])
    expect(h.plugin.outbox.waiting).toBe(0)
    // A line with a vault id is in OpenTodo too.
    expect(await h.plugin.sender.sendLines(memoryEditor('- [ ] Synced 🆔 t-1'), NOTE, 0, 0)).toEqual([])
  })

  it('Selection too large: the sheet says at most 50 lines and sends nothing', async () => {
    const h = await connected()
    const ed = memoryEditor(Array.from({ length: 80 }, (_, i) => `Line ${i}`).join('\n'))
    let text = ''
    await send(h, ed, 0, 79, (s) => {
      text = s.textContent ?? ''
      key(s.querySelector('button')!, 'Enter')
    })
    expect(text).toMatch(/At most 50 lines can be sent at once; 80 are selected/)
    expect(h.plugin.outbox.waiting).toBe(0)
    expect(ed.getLine(0)).toBe('Line 0')
  })

  it('Escape cancels and Send without asking skips the sheet', async () => {
    const h = await connected()
    const ed = memoryEditor('Buy milk')
    expect(await send(h, ed, 0, 0, (s) => key(s.querySelector('input')!, 'Escape'))).toEqual([])
    expect(ed.getLine(0)).toBe('Buy milk')
    h.plugin.settings.sendWithoutAsking = true
    expect((await send(h, ed, 0)).length).toBe(1)
    expect(sheet()).toBeNull()
  })

  it('Undo within ten seconds restores the line exactly and moves the task to the Trash', async () => {
    const h = await connected()
    h.plugin.settings.sendWithoutAsking = true
    const ed = memoryEditor('Call the plumber tomorrow 9am p2')
    const [id] = await send(h, ed, 0)
    await until(() => h.server.tasks().length === 1)
    const n = notice(/^Sent to OpenTodo/)!
    expect(n.timeout).toBe(10_000)
    n.el.querySelector('button')!.dispatchEvent(new MouseEvent('click'))
    await until(() => h.server.row('task', id)?.deleted_at !== undefined && h.server.row('task', id)?.deleted_at !== null)
    expect(ed.text()).toBe('Call the plumber tomorrow 9am p2')
  })

  it('Line removed by setting: gone from the note, and Undo puts it back', async () => {
    const h = await connected()
    h.plugin.settings.sendWithoutAsking = true
    h.plugin.settings.afterSending = 'remove'
    const ed = memoryEditor('# Notes\nBuy milk\nThe end')
    h.server.offline = true
    await send(h, ed, 1)
    expect(ed.text()).toBe('# Notes\nThe end')
    // Offline: the push after sending failed, the task waits on the device.
    expect(await h.plugin.pushNow()).toEqual({ kind: 'offline' })
    notice(/^Sent to OpenTodo/)!.el.querySelector('button')!.dispatchEvent(new MouseEvent('click'))
    await until(() => ed.text() === '# Notes\nBuy milk\nThe end')
    // Undone before it left the device: nothing waits and nothing reaches the server.
    expect(h.plugin.outbox.waiting).toBe(0)
  })

  it('Mark done ticks the line, with Tasks’ done date only on a Tasks line', async () => {
    const h = await connected()
    h.plugin.settings.sendWithoutAsking = true
    h.plugin.settings.afterSending = 'done'
    const ed = memoryEditor('- [ ] Renew passport 📅 2026-11-05\n- Buy milk')
    await send(h, ed, 0, 1)
    expect(ed.getLine(0)).toBe('- [x] Renew passport 📅 2026-11-05 ✅ 2026-10-29')
    expect(ed.getLine(1)).toBe('- [x] Buy milk')
  })

  it('Note renamed: the linked tasks get origins naming the new path', async () => {
    const h = await connected()
    h.plugin.settings.sendWithoutAsking = true
    const ed = memoryEditor('Call Bob\nBuy milk')
    const ids = await send(h, ed, 0, 1)
    await until(() => h.server.tasks().length === 2)
    h.app.files.set('Daily/Thursday.md', ed.text())
    h.app.vault.trigger('rename', new TFile('Daily/Thursday.md'), NOTE)
    await until(() => ids.every((id) => (h.server.row('task', id)?.origin as { id: string }).id === 'Daily/Thursday.md'))
    const origin = h.server.row('task', ids[0])!.origin as { id: string; url: string }
    expect(obsidianURL(origin.url, origin.id)).toEqual({ vault: 'Work notes', file: 'Daily/Thursday.md' })
    // The fix command does the same for a rename this device did not see.
    const fix = (h.plugin as unknown as { commands: { id: string; editorCallback?: (e: unknown, v: unknown) => unknown }[] }).commands.find((c) => c.id === 'fix-links')!
    fix.editorCallback!({ getValue: () => ed.text() }, { file: new TFile('Archive/Old.md') })
    await until(() => ids.every((id) => (h.server.row('task', id)?.origin as { id: string }).id === 'Archive/Old.md'))
  })
})

describe('offline', () => {
  it('Sent on a plane: both lines get links at once, 2 waiting, both tasks after reconnecting', async () => {
    const h = await connected()
    h.plugin.settings.sendWithoutAsking = true
    h.server.offline = true
    const ed = memoryEditor('Buy milk\nCall Bob')
    await send(h, ed, 0, 1)
    expect(ed.getLine(0)).toMatch(/\[opentodo:: /)
    expect(ed.getLine(1)).toMatch(/\[opentodo:: /)
    await until(() => h.server.pushes.length === 0)
    expect(h.plugin.outbox.waiting).toBe(2)
    h.server.offline = false
    await h.plugin.pushNow()
    expect(h.server.tasks().length).toBe(2)
    expect(h.plugin.outbox.waiting).toBe(0)
  })

  it('Interrupted push: each task exists once', async () => {
    const h = await connected()
    h.plugin.settings.sendWithoutAsking = true
    h.server.dropNextAnswer = true
    await send(h, memoryEditor('Buy milk'), 0)
    await until(() => h.server.pushes.length === 1)
    await until(() => !h.server.dropNextAnswer)
    expect(h.plugin.outbox.waiting).toBe(1)
    await h.plugin.pushNow()
    expect(h.server.tasks().length).toBe(1)
    expect([...h.server.ops.values()].filter((o) => o.field === 'title').length).toBe(1)
    expect(h.plugin.outbox.waiting).toBe(0)
  })

  it('Refused: dropped from the outbox, and the notice names the project, the reason and the note', async () => {
    const h = await connected()
    h.server.projects = [{ id: 'p-shared', name: 'Family', role: 'editor', owner_id: 'u2' }]
    await h.plugin.refreshLists(true)
    h.plugin.settings.sendWithoutAsking = true
    h.plugin.settings.defaultProject = 'p-shared'
    h.server.offline = true
    await send(h, memoryEditor('Buy milk'), 0)
    h.server.viewerOf.add('p-shared')
    h.server.offline = false
    await h.plugin.pushNow()
    expect(h.plugin.outbox.waiting).toBe(0)
    expect(h.server.tasks()).toEqual([])
    expect(notice(/refused “Buy milk” from Daily\/2026-10-29\.md for Family: forbidden/)).toBeDefined()
  })
})

describe('encrypted account', () => {
  beforeEach(() => {
    ITERATION_LIMITS.min = 1000
  })
  afterEach(() => {
    ITERATION_LIMITS.min = 100_000
  })

  it('Encrypted send: the server stores only ciphertext for the title and the origin', async () => {
    const { record, key: accountKey } = await createKeyRecord('correct horse battery', { iterations: 1000 })
    const h = await connected({ encrypted: true, record })
    h.plugin.settings.sendWithoutAsking = true
    await h.plugin.keys.unlock(record, 'correct horse battery', false)
    const [id] = await send(h, memoryEditor('Renew passport'), 0)
    await until(() => h.server.tasks().length === 1)
    const row = h.server.row('task', id)!
    expect(isEnvelope(row.title) && isEnvelope(row.origin)).toBe(true)
    expect(await openValue(accountKey, 'task', id, 'title', row.title)).toBe('Renew passport')
    expect(await openValue(accountKey, 'task', id, 'origin', row.origin)).toMatchObject({ kind: 'obsidian', id: NOTE })
    // The key was not remembered on the device.
    expect(h.app.local.has('opentodo:key')).toBe(false)
  })

  it('Locked: nothing is queued, the line is unchanged, and the notice offers Unlock OpenTodo', async () => {
    const { record } = await createKeyRecord('correct horse battery', { iterations: 1000 })
    const h = await connected({ encrypted: true, record })
    h.plugin.settings.sendWithoutAsking = true
    const ed = memoryEditor('Renew passport')
    expect(await h.plugin.sender.sendLines(ed, NOTE, 0, 0)).toEqual([])
    expect(ed.text()).toBe('Renew passport')
    expect(h.plugin.outbox.waiting).toBe(0)
    expect(notice(/encrypted and locked/)?.el.textContent).toMatch(/Unlock OpenTodo/)
  })

  it('Remember on this device keeps the key across a restart', async () => {
    const { record } = await createKeyRecord('correct horse battery', { iterations: 1000 })
    const h = await connected({ encrypted: true, record })
    await h.plugin.keys.unlock(record, 'correct horse battery', true)
    expect(h.app.local.has('opentodo:key')).toBe(true)
    await h.plugin.onload()
    expect(h.plugin.keys.unlocked).toBe(true)
  })
})

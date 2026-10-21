// Run with: node --test extension/popup.test.js  (or `make extension`)
// The popup's state and Quick save flow (OpenSpec change extension-v2, design D3,
// D4; share-capture "Extension popup", "Quick save", "Mail message recognition"),
// against a stubbed API: what is prefilled, what a save sends and in which order,
// and what a failure offers.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { ApiError, createApi } from './api.js'
import { captureFromMenu, captureFromTab } from './capture.js'
import { recognizeMail } from './mail.js'
import {
  debounceParse, descriptionFor, failureOf, labelsFor, onceAtATime, originFor, parseForSave, prefill, projectFor, quickSave, reminderBody, sharePage, spentBody, taskBody,
} from './popup-state.js'
import { buildShareUrl } from './share-url.js'

const article = { id: 1, title: 'How to bleed a radiator', url: 'https://blog.example/radiator' }

/** An API whose calls are recorded; `fail` maps a method to the error it throws. */
function fakeApi({ labels = {}, fail = {} } = {}) {
  const calls = []
  let n = 0
  const rec = (name, result) => async (...args) => {
    calls.push([name, ...args])
    if (fail[name]) throw fail[name]
    return result(...args)
  }
  return {
    calls,
    createLabel: rec('createLabel', (name) => {
      labels[name.toLowerCase()] ??= `label-${++n}`
      return { id: labels[name.toLowerCase()], name }
    }),
    createTask: rec('createTask', () => ({ id: 'task-1' })),
    createReminder: rec('createReminder', () => ({ id: 'rem' })),
    createTimeEntry: rec('createTimeEntry', () => ({ id: 'time' })),
  }
}

// What the parse route answers for `Call the plumber tomorrow 9am #Home @call p1 remind me at 8` on 2026-10-22.
const plumber = {
  title: 'Call the plumber',
  fields: {
    due: { date: '2026-10-23', time: '09:00' },
    project_id: 'proj-home',
    labels: [{ id: 'lab-call', name: 'call' }],
    priority: 1,
    reminders: [{ kind: 'absolute', date: '2026-10-23', time: '08:00' }],
  },
  chips: [],
  unmatched: [],
  origin: { kind: 'url', url: article.url },
}

test('Popup from the toolbar: the title, the page as the origin, Inbox', () => {
  const p = prefill(captureFromTab(article, ''))
  assert.equal(p.line, 'How to bleed a radiator')
  assert.equal(p.text, '')
  assert.deepEqual(originFor(p, null), { kind: 'url', url: article.url })
  assert.equal(projectFor(null, undefined), null)
})

test('prefill from a selection, a link and an image', () => {
  assert.equal(prefill(captureFromTab(article, 'Turn the valve')).text, 'Turn the valve')
  assert.equal(prefill(captureFromMenu({ linkUrl: 'https://shop.example/kit', linkText: 'Radiator bleeding kit' }, article)).line, 'Radiator bleeding kit')
  const img = prefill(captureFromMenu({ mediaType: 'image', srcUrl: 'https://cdn.example/boiler-manual.png' }, article))
  assert.equal(img.line, 'boiler-manual.png')
  assert.equal(descriptionFor(img), 'https://cdn.example/boiler-manual.png\n\nhttps://blog.example/radiator')
})

test('Save with parsed fields: the task, then its reminder, as the CLI does', async () => {
  const api = fakeApi()
  const p = prefill(captureFromTab(article, 'Bleed the bedroom radiator first'))
  const task = await quickSave(api, { line: 'Call the plumber tomorrow 9am #Home @call p1 remind me at 8', parsed: plumber, origin: originFor(p, plumber), description: descriptionFor(p) })
  assert.equal(task.id, 'task-1')
  assert.deepEqual(api.calls.map((c) => c[0]), ['createTask', 'createReminder'])
  assert.deepEqual(api.calls[0][1], {
    title: 'Call the plumber',
    due: { date: '2026-10-23', time: '09:00' },
    priority: 1,
    project_id: 'proj-home',
    labels: ['lab-call'],
    origin: { kind: 'url', url: article.url },
    description: 'Bleed the bedroom radiator first\n\nhttps://blog.example/radiator',
  })
  assert.deepEqual(api.calls[1], ['createReminder', { task_id: 'task-1', kind: 'absolute', fire_at: new Date(2026, 9, 23, 8, 0).getTime() }, 1])
})

test('New label: created first, and reused by a second save', async () => {
  const labels = {}
  const parsed = { title: 'Fix the tap', fields: { labels: [{ name: 'plumbing' }] } }
  const api = fakeApi({ labels })
  await quickSave(api, { line: 'Fix the tap @plumbing', parsed })
  assert.deepEqual(api.calls.slice(0, 2).map((c) => c.slice(0, 2)), [['createLabel', 'plumbing'], ['createTask', { title: 'Fix the tap', labels: ['label-1'] }]])
  // The next parse knows the label by its id.
  const api2 = fakeApi({ labels })
  await quickSave(api2, { line: 'Again @plumbing', parsed: { title: 'Again', fields: { labels: [{ id: labels.plumbing, name: 'plumbing' }] } } })
  assert.deepEqual(api2.calls.map((c) => c[0]), ['createTask'])
  assert.deepEqual(api2.calls[0][1].labels, ['label-1'])
})

test('pickers override the parse', async () => {
  const api = fakeApi()
  await quickSave(api, { line: 'x', parsed: plumber, picks: { projectId: null, labels: [{ id: 'lab-urgent', name: 'urgent' }, { id: 'dup', name: 'URGENT' }] } })
  const body = api.calls[0][1]
  assert.equal(body.project_id, undefined, 'Inbox chosen')
  assert.deepEqual(body.labels, ['lab-urgent'])
  assert.equal(projectFor(plumber, 'proj-work'), 'proj-work')
  assert.deepEqual(labelsFor(plumber, undefined), [{ id: 'lab-call', name: 'call' }])
})

test('tracked time is one closed entry ending now; relative reminders keep their offset', async () => {
  const api = fakeApi()
  await quickSave(api, { line: 'x', parsed: { title: 'x', fields: { spent_minutes: 30, reminders: [{ kind: 'relative', offset_minutes: 15 }] } }, now: 1_000_000_000 })
  assert.deepEqual(api.calls.slice(1), [
    ['createReminder', { task_id: 'task-1', kind: 'relative', offset_minutes: 15 }, 1],
    ['createTimeEntry', { taskId: 'task-1', startedAt: 1_000_000_000 - 30 * 60_000, endedAt: 1_000_000_000 }],
  ])
  assert.deepEqual(spentBody('t', 1, 60_000), { taskId: 't', startedAt: 0, endedAt: 60_000 })
  assert.deepEqual(reminderBody('t', { kind: 'relative', offset_minutes: 0 }), { task_id: 't', kind: 'relative', offset_minutes: 0 })
})

test('Parse route unavailable: the line is the title', async () => {
  assert.deepEqual(taskBody({ line: '  Buy milk  ', parsed: null }), { title: 'Buy milk' })
  const parsed = await parseForSave({}, 'Buy milk', null, async () => { throw new ApiError('unreachable', 'x') })
  assert.equal(parsed, null)
})

test('a save uses the parse of exactly this line, else asks again', async () => {
  const asked = []
  const ask = async (line) => (asked.push(line), { title: line.toUpperCase(), fields: {} })
  assert.equal(await parseForSave({}, 'a', { line: 'a', parsed: plumber }, ask), plumber)
  assert.deepEqual(await parseForSave({}, 'ab', { line: 'a', parsed: plumber }, ask), { title: 'AB', fields: {} })
  assert.deepEqual(asked, ['ab'])
  assert.equal(await parseForSave(null, 'ab', null, ask), null, 'no token: no parse')
})

test('Unknown project: the #word stays in the title', () => {
  const parsed = { title: 'Pay #Fiance', fields: {}, unmatched: ['#Fiance'] }
  assert.equal(taskBody({ line: 'Pay #Fiance', parsed }).title, 'Pay #Fiance')
})

test('Server unreachable: the text is kept and the capture screen is offered', async () => {
  const api = fakeApi({ fail: { createTask: new ApiError('unreachable', 'the server could not be reached') } })
  const err = await quickSave(api, { line: 'x', parsed: null }).catch((e) => e)
  assert.deepEqual(failureOf(err), { key: 'popupUnreachable', capture: true, options: false })
  assert.equal(err.taskId, undefined)
  const p = prefill(captureFromTab(article, 'sel'))
  assert.equal(buildShareUrl('https://todo.example.com', sharePage(p, 'my edited line')), buildShareUrl('https://todo.example.com', { title: 'my edited line', text: 'sel', url: article.url }))
})

test('Token refused: points to the options page; nothing retried', async () => {
  const api = fakeApi({ fail: { createTask: new ApiError('unauthorized', 'authentication required', 401) } })
  const err = await quickSave(api, { line: 'x', parsed: null }).catch((e) => e)
  assert.deepEqual(failureOf(err), { key: 'popupTokenRefused', capture: true, options: true })
  assert.equal(api.calls.length, 1)
  assert.equal(failureOf(new ApiError('forbidden', '')).key, 'popupTokenRefused')
  assert.equal(failureOf(new ApiError('encrypted', '')).key, 'popupEncrypted')
  assert.equal(failureOf(new ApiError('rate_limited', '')).key, 'popupRateLimited')
  assert.equal(failureOf(new ApiError('invalid', '')).key, 'popupFailed')
})

test('a failure after the task exists names the task, so it is never sent twice', async () => {
  const api = fakeApi({ fail: { createReminder: new ApiError('failed', 'boom', 500) } })
  const err = await quickSave(api, { line: 'x', parsed: plumber }).catch((e) => e)
  assert.equal(err.taskId, 'task-1')
})

test('No double task: a second Enter while saving does nothing, and one key covers retries', async () => {
  let release
  let creates = 0
  const save = onceAtATime(async () => {
    creates++
    await new Promise((r) => (release = r))
  })
  const first = save()
  const second = save()
  release()
  await Promise.all([first, second])
  assert.equal(creates, 1)
  // The server deduplicates on the key: the same popup opening sends the same one.
  const keys = []
  const fetchImpl = async (url, init) => (keys.push(init.headers['Idempotency-Key']), { ok: true, status: 201, json: async () => ({ id: 't' }) })
  const api = createApi({ server: 'https://todo.example.com', token: 't', fetchImpl })
  await api.createTask({ title: 'a' })
  await api.createTask({ title: 'a' })
  assert.equal(keys[0], keys[1])
})

test('Capture screen mode is the default: Save opens /share with the line, the text and the address', () => {
  const p = prefill(captureFromTab(article, 'Turn the valve'))
  const url = new URL(buildShareUrl('https://todo.example.com', sharePage(p, 'Bleed radiators')))
  assert.equal(url.origin + url.pathname, 'https://todo.example.com/share')
  assert.equal(url.searchParams.get('title'), 'Bleed radiators')
  assert.equal(url.searchParams.get('text'), 'Turn the valve')
  assert.equal(url.searchParams.get('url'), article.url)
  assert.equal(new URL(buildShareUrl('https://todo.example.com', sharePage(p, 'x', false))).searchParams.get('url'), null, 'origin removed')
})

const gmailTab = { id: 2, url: 'https://mail.google.com/mail/u/0/#inbox/FMfcgzQbfLnVwXkPqRtSzHjKmBdCxWvN', title: 'Boiler service quote - me@example.com - Gmail' }

test('Gmail message: subject, From line, email origin', async () => {
  const mail = recognizeMail({ url: gmailTab.url, title: gmailTab.title, header: { name: 'Acme Heating', email: 'quotes@acme.example' } })
  const p = prefill(captureFromTab(gmailTab, ''), mail)
  assert.equal(p.line, 'Boiler service quote')
  assert.ok(descriptionFor(p).startsWith('From: Acme Heating <quotes@acme.example>'))
  const api = fakeApi()
  await quickSave(api, { line: p.line, parsed: null, origin: originFor(p, null), description: descriptionFor(p) })
  assert.deepEqual(api.calls[0][1].origin, { kind: 'email', provider: 'gmail', id: 'FMfcgzQbfLnVwXkPqRtSzHjKmBdCxWvN', url: gmailTab.url, title: 'Boiler service quote' })
  // Capture screen mode passes the subject and the permalink.
  const share = new URL(buildShareUrl('https://todo.example.com', sharePage(p, p.line)))
  assert.equal(share.searchParams.get('title'), 'Boiler service quote')
  assert.equal(share.searchParams.get('url'), gmailTab.url)
})

test('Outlook list view: filled like any page', () => {
  const listTab = { url: 'https://outlook.office.com/mail/inbox', title: 'Mail - Anne-Marie Dupont - Outlook' }
  const p = prefill(captureFromTab(listTab, ''), recognizeMail({ url: listTab.url, title: listTab.title, header: null }))
  assert.equal(p.line, 'Mail - Anne-Marie Dupont - Outlook')
  assert.equal(p.text, '')
  assert.deepEqual(originFor(p, null), { kind: 'url', url: listTab.url })
})

test('Header not readable: subject and permalink, no From line', () => {
  const mail = recognizeMail({ url: gmailTab.url, title: gmailTab.title, header: null })
  const p = prefill(captureFromTab(gmailTab, ''), mail)
  assert.equal(p.line, 'Boiler service quote')
  assert.equal(descriptionFor(p, false), '')
  assert.equal(originFor(p, null).provider, 'gmail')
})

test('removing the origin drops it and the address from the description', () => {
  const p = prefill(captureFromTab(article, 'sel'))
  assert.equal(originFor(p, plumber, false), null)
  assert.equal(descriptionFor(p, false), 'sel')
})

test('the parse waits for a quiet line and never sends an empty one', () => {
  const pending = new Map()
  let id = 0
  const timers = { setTimeout: (fn, ms) => (pending.set(++id, [fn, ms]), id), clearTimeout: (t) => pending.delete(t) }
  const sent = []
  const parse = debounceParse((l) => sent.push(l), 150, timers)
  parse('t')
  parse('to')
  parse('tom')
  assert.equal(pending.size, 1)
  const [[fn, ms]] = pending.values()
  assert.equal(ms, 150)
  fn()
  assert.deepEqual(sent, ['tom'])
  parse('   ')
  assert.equal(pending.size, 1, 'the old timer was cleared, no new one')
})

test('Escape closes; every control in the popup is labelled', () => {
  const html = readFileSync(new URL('./popup.html', import.meta.url), 'utf8')
  const js = readFileSync(new URL('./popup.js', import.meta.url), 'utf8')
  assert.match(js, /e\.key === 'Escape'\) window\.close\(\)/)
  for (const [, id] of html.matchAll(/<(?:input|select|textarea)[^>]*\bid="([^"]+)"/g)) {
    assert.match(html, new RegExp(`for="${id}"|id="${id}"[^>]*aria-label`), `#${id} has no label`)
  }
  assert.match(html, /aria-live/)
})

// The toolbar popup (OpenSpec change extension-v2, design D3; share-capture
// "Extension popup", "Quick save", "Parse preview in the popup"). One quick-add
// line prefilled from the page, a project and a label picker, the page as the
// origin, and Save: in Capture screen mode Save opens the server's /share screen
// (no request from the extension); in Quick save mode it saves through the API
// with the user's token, previewing the line with the server's parse route.
import { createApi, localNow } from './api.js'
import { PENDING_KEY, captureFromTab, descriptionOf } from './capture.js'
import { HEADER_SELECTORS, mailClientOf, readMailHeader, recognizeMail } from './mail.js'
import { debounceParse, descriptionFor, failureOf, labelsFor, onceAtATime, originFor, parseForSave, prefill, projectFor, quickSave, sharePage } from './popup-state.js'
import { MODE_QUICK, canParse, effectiveMode, ext, readSettings } from './settings.js'
import { MAX_TEXT, buildShareUrl, encodePending } from './share-url.js'

const msg = (key, ...subs) => ext.i18n.getMessage(key, subs) || key
for (const el of document.querySelectorAll('[data-i18n]')) {
  const text = ext.i18n.getMessage(el.dataset.i18n)
  if (text) el.textContent = text
}
document.documentElement.lang = ext.i18n.getUILanguage?.() || 'en'

const $ = (id) => document.getElementById(id)
const form = $('form')
const line = $('line')
const chipsEl = $('chips')
const descEl = $('description')
const projectEl = $('project')
const labelsEl = $('labels')
const addLabelEl = $('add-label')
const originRow = $('origin-row')
const originEl = $('origin')
const statusEl = $('status')
const saveBtn = $('save')
const captureBtn = $('capture')

// Escape closes without saving or storing anything (share-capture "Extension popup").
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.close()
})

/** The selection of the active tab, read under activeTab on the user's click. */
async function selectionOf(tab) {
  if (tab?.id == null) return ''
  try {
    const [res] = await ext.scripting.executeScript({ target: { tabId: tab.id }, func: (max) => String(globalThis.getSelection?.() ?? '').slice(0, max), args: [MAX_TEXT] })
    return typeof res?.result === 'string' ? res.result : ''
  } catch {
    return '' // pages the browser protects cannot be scripted
  }
}

/** A message open in Gmail or Outlook on the web, or null (share-capture "Mail message recognition"). */
async function mailOf(tab) {
  const client = mailClientOf(tab?.url)
  if (!client) return null
  let header = null
  try {
    const [res] = await ext.scripting.executeScript({ target: { tabId: tab.id }, func: readMailHeader, args: [HEADER_SELECTORS[client.provider]] })
    header = res?.result ?? null
  } catch {
    header = null
  }
  return recognizeMail({ url: tab.url, title: tab.title, header })
}

// What was clicked: a context-menu capture handed over by the background script, else the tab.
const [tab] = await ext.tabs.query({ active: true, currentWindow: true })
let capture = null
try {
  capture = (await ext.storage.session.get(PENDING_KEY))?.[PENDING_KEY] ?? null
  if (capture) await ext.storage.session.remove(PENDING_KEY)
} catch {
  capture = null
}
if (!capture) capture = captureFromTab(tab, await selectionOf(tab))
const mail = !capture.imageUrl && capture.url === tab?.url ? await mailOf(tab) : null
const start = prefill(capture, mail)

const state = {
  settings: await readSettings(),
  parsed: null,
  parsedLine: null, // the line `parsed` belongs to
  pickedProject: undefined, // undefined = follow the line; null = Inbox
  pickedLabels: undefined, // undefined = follow the line
  keepOrigin: !!start.url,
  done: false, // a task was created: Save stays off
}
const mode = effectiveMode(state.settings)
const api = state.settings.server && state.settings.token ? createApi({ server: state.settings.server, token: state.settings.token }) : null

function origin() {
  return originFor(start, state.parsed, state.keepOrigin)
}

function render() {
  const d = descriptionOf({ imageUrl: start.imageUrl, text: start.text, keepUrl: false })
  descEl.hidden = !d
  descEl.textContent = d
  originRow.hidden = !state.keepOrigin || !start.url
  const o = origin()
  originEl.textContent = o?.kind === 'email' ? `${o.provider === 'gmail' ? 'Gmail' : 'Outlook'} · ${o.title}` : o?.id || start.url
  originEl.title = start.url
  chipsEl.replaceChildren(...(state.parsed?.chips ?? []).map((c) => {
    const span = document.createElement('span')
    span.className = `chip${c.kind === 'unmatched' ? ' unmatched' : ''}`
    span.textContent = c.text
    return span
  }))
  const pid = projectFor(state.parsed, state.pickedProject)
  if ([...projectEl.options].some((opt) => opt.value === (pid ?? ''))) projectEl.value = pid ?? ''
  labelsEl.replaceChildren(...labelsFor(state.parsed, state.pickedLabels).map((l) => {
    const li = document.createElement('li')
    li.append(`@${l.name}`)
    const rm = document.createElement('button')
    rm.type = 'button'
    rm.className = 'icon-button'
    rm.setAttribute('aria-label', msg('popupRemoveLabel', l.name))
    rm.append(crossIcon())
    rm.addEventListener('click', () => {
      state.pickedLabels = labelsFor(state.parsed, state.pickedLabels).filter((x) => x.name.toLowerCase() !== l.name.toLowerCase())
      render()
    })
    li.append(rm)
    return li
  }))
}

/** The small cross of a remove button, built without innerHTML. */
function crossIcon() {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  for (const [k, v] of Object.entries({ 'aria-hidden': 'true', viewBox: '0 0 16 16', width: '12', height: '12' })) svg.setAttribute(k, v)
  const path = document.createElementNS(ns, 'path')
  for (const [k, v] of Object.entries({ d: 'M4 4l8 8M12 4l-8 8', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round' })) path.setAttribute(k, v)
  svg.append(path)
  return svg
}

function show(text, kind = '') {
  statusEl.hidden = !text
  statusEl.className = `status ${kind}`
  statusEl.textContent = text
}

line.value = start.line
render()
line.focus()
line.select()

/** Ask the server's parse route about one line. */
function askParse(text) {
  const { today, now } = localNow()
  return api.parse(text, start.url, today, now)
}

// Quick save: the account's projects and labels for the pickers, and chips while typing.
if (api && canParse(state.settings)) {
  void Promise.all([api.projects(), api.labels()]).then(([projects, labels]) => {
    for (const p of projects.filter((p) => !p.archived && !p.deleted_at && typeof p.name === 'string' && !p.name.startsWith('enc:'))) {
      projectEl.append(new Option(p.name, p.id))
    }
    for (const l of labels.filter((l) => !l.deleted_at && typeof l.name === 'string' && !l.name.startsWith('enc:'))) {
      addLabelEl.append(new Option(`@${l.name}`, JSON.stringify({ id: l.id, name: l.name })))
    }
    render()
  }).catch(() => {})
  const parse = debounceParse(async (text) => {
    try {
      const res = await askParse(text)
      if (line.value === text) {
        state.parsed = res
        state.parsedLine = text
        render()
      }
    } catch {
      state.parsed = null // the parse route is unavailable: no chips, Save still works
      state.parsedLine = null
      render()
    }
  })
  line.addEventListener('input', () => {
    if (!line.value.trim()) {
      state.parsed = null
      state.parsedLine = null
      render()
    }
    parse(line.value)
  })
  parse(line.value)
}

projectEl.addEventListener('change', () => {
  state.pickedProject = projectEl.value || null
  render()
})
addLabelEl.addEventListener('change', () => {
  if (!addLabelEl.value) return
  const l = JSON.parse(addLabelEl.value)
  state.pickedLabels = labelsFor(state.parsed, [...labelsFor(state.parsed, state.pickedLabels), l])
  addLabelEl.value = ''
  render()
})
$('remove-origin').addEventListener('click', () => {
  state.keepOrigin = false
  render()
  line.focus()
})

/** Open the capture screen with what the popup holds (the default mode and the fallback). */
async function openCaptureScreen() {
  const { server } = state.settings
  const page = sharePage(start, line.value, state.keepOrigin)
  if (!server) {
    // First run: the options page carries the capture in its own URL (never stored).
    await ext.tabs.create({ url: `${ext.runtime.getURL('options.html')}?${encodePending(page)}` })
  } else {
    await ext.windows.create({ url: buildShareUrl(server, page), type: 'popup', width: 480, height: 640 })
  }
  window.close()
}
captureBtn.addEventListener('click', () => void openCaptureScreen())

// One save at a time: a second Enter while the first is in flight does nothing,
// and a created task is never sent again (state.done).
const save = onceAtATime(async () => {
  if (state.done || !line.value.trim()) return
  if (mode !== MODE_QUICK) return openCaptureScreen()
  saveBtn.disabled = true
  show(msg('popupSaving'))
  try {
    const text = line.value
    const parsed = await parseForSave(api, text, state.parsedLine === null ? null : { line: state.parsedLine, parsed: state.parsed }, canParse(state.settings) ? askParse : null)
    const task = await quickSave(api, { line: text, parsed, picks: { projectId: state.pickedProject, labels: state.pickedLabels }, origin: originFor(start, parsed, state.keepOrigin), description: descriptionFor(start, state.keepOrigin) })
    state.done = true
    statusEl.hidden = false
    statusEl.className = 'status ok'
    const a = document.createElement('a')
    a.href = `${state.settings.server}/task/${encodeURIComponent(task.id)}`
    a.target = '_blank'
    a.textContent = msg('popupOpenTask')
    statusEl.replaceChildren(`${msg('popupSaved')} · `, a)
    setTimeout(() => window.close(), 2000)
  } catch (err) {
    const f = failureOf(err)
    show(f.key === 'popupFailed' ? msg('popupFailed', err?.message ?? '') : msg(f.key), 'error')
    // The task exists when only its reminders or time failed: never send it twice.
    state.done = !!err?.taskId
    captureBtn.hidden = !f.capture || state.done
    if (f.options) $('options').focus()
    saveBtn.disabled = state.done
  }
})
form.addEventListener('submit', (e) => {
  e.preventDefault()
  void save()
})

if (!state.settings.server) show(msg('popupNoServer'))

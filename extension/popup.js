// The toolbar popup (OpenSpec change extension-v2, design D3; share-capture
// "Extension popup", "Quick save", "Parse preview in the popup"). One quick-add
// line prefilled from the page, a project and a label picker, the page as the
// origin, and Save: in Capture screen mode Save opens the server's /share screen
// (no request from the extension); in Quick save mode it saves through the API
// with the user's token, previewing the line with the server's parse route.
import { createApi, localNow } from './api.js'
import { PENDING_KEY, captureFromTab, descriptionOf } from './capture.js'
import { HEADER_SELECTORS, mailClientOf, readMailHeader, recognizeMail } from './mail.js'
import { debounceParse, failureOf, labelsFor, projectFor, quickSave } from './popup-state.js'
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
if (mail) capture = { ...capture, title: mail.subject }

const state = {
  settings: await readSettings(),
  parsed: null,
  pickedProject: undefined, // undefined = follow the line; null = Inbox
  pickedLabels: undefined, // undefined = follow the line
  keepOrigin: !!capture.url,
  saving: false,
}
const mode = effectiveMode(state.settings)
const api = state.settings.server && state.settings.token ? createApi({ server: state.settings.server, token: state.settings.token }) : null

/** The selection, or the mail's From line followed by the selection. */
function textOf() {
  const from = mail?.from ? `From: ${mail.from}` : ''
  return [from, capture.text.trim()].filter(Boolean).join('\n\n')
}

function origin() {
  if (!state.keepOrigin || !capture.url) return null
  if (mail) return mail.origin
  return state.parsed?.origin ?? { kind: 'url', url: capture.url }
}

function description() {
  return descriptionOf({ imageUrl: capture.imageUrl, text: textOf(), url: capture.url, keepUrl: state.keepOrigin })
}

function render() {
  const d = descriptionOf({ imageUrl: capture.imageUrl, text: textOf(), keepUrl: false })
  descEl.hidden = !d
  descEl.textContent = d
  originRow.hidden = !state.keepOrigin || !capture.url
  const o = origin()
  originEl.textContent = o?.kind === 'email' ? `${o.provider === 'gmail' ? 'Gmail' : 'Outlook'} · ${o.title}` : o?.id || capture.url
  originEl.title = capture.url
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

line.value = capture.title
render()
line.focus()
line.select()

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
    const { today, now } = localNow()
    try {
      const res = await api.parse(text, capture.url, today, now)
      if (line.value === text) {
        state.parsed = res
        render()
      }
    } catch {
      state.parsed = null // the parse route is unavailable: no chips, Save still works
      render()
    }
  })
  line.addEventListener('input', () => {
    if (!line.value.trim()) {
      state.parsed = null
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
  const page = { title: line.value, text: textOf(), url: state.keepOrigin ? capture.url : '' }
  if (!server) {
    // First run: the options page carries the capture in its own URL (never stored).
    await ext.tabs.create({ url: `${ext.runtime.getURL('options.html')}?${encodePending(page)}` })
  } else {
    await ext.windows.create({ url: buildShareUrl(server, page), type: 'popup', width: 480, height: 640 })
  }
  window.close()
}
captureBtn.addEventListener('click', () => void openCaptureScreen())

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  if (state.saving || !line.value.trim()) return
  if (mode !== MODE_QUICK) return openCaptureScreen()
  state.saving = true
  saveBtn.disabled = true
  show(msg('popupSaving'))
  try {
    const parsed = state.parsed && state.parsed.title !== undefined && line.value.trim() ? state.parsed : null
    const task = await quickSave(api, { line: line.value, parsed, picks: { projectId: state.pickedProject, labels: state.pickedLabels }, origin: origin(), description: description() })
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
    captureBtn.hidden = !f.capture || !!err?.taskId
    if (f.options) $('options').focus()
    state.saving = false
    saveBtn.disabled = !!err?.taskId // a created task is never sent twice
  }
})

if (!state.settings.server) show(msg('popupNoServer'))

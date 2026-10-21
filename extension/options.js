import { createApi } from './api.js'
import { MODE_CAPTURE, MODE_QUICK, readSettings, scopeDecision, tokenAllowed } from './settings.js'
import { buildShareUrl, decodePending, normalizeServer, originPattern } from './share-url.js'

const ext = globalThis.browser ?? globalThis.chrome

// The page's texts in the browser's interface language (_locales; OpenSpec
// app-localization D10); the HTML keeps the English text for a missing message.
const msg = (key, ...subs) => ext.i18n.getMessage(key, subs) || key
for (const el of document.querySelectorAll('[data-i18n]')) {
  const text = ext.i18n.getMessage(el.dataset.i18n)
  if (text) el.textContent = text
}
document.documentElement.lang = ext.i18n.getUILanguage?.() || 'en'

const form = document.getElementById('form')
const input = document.getElementById('server')
const status = document.getElementById('status')
const pendingNote = document.getElementById('pending')

// First run: the page that was being captured rides along in this page's URL.
const pending = decodePending(location.search)
if (pending) {
  pendingNote.hidden = false
  pendingNote.textContent = msg('pendingNote', pending.title || pending.url || msg('thisPage'))
}

function show(message, error = false) {
  status.hidden = false
  status.textContent = message
  status.classList.toggle('error', error)
}

const { server } = await ext.storage.sync.get('server')
if (server) input.value = server

const shots = document.getElementById('screenshots')
const allow = document.getElementById('allow')

/** Show whether screenshots can be handed to the capture popup on this server. */
async function showAccess(origin) {
  if (!origin) return
  const granted = await ext.permissions.contains({ origins: [originPattern(origin)] })
  shots.textContent = granted ? msg('screenshotsAllowed', origin) : msg('screenshotsNotAllowed')
  allow.hidden = granted
}
if (server) void showAccess(server)

// Ask for access to the server's address, from the click (browsers require a gesture).
function requestAccess(origin) {
  return ext.permissions.request({ origins: [originPattern(origin)] }).catch(() => false)
}

allow.addEventListener('click', async () => {
  const origin = normalizeServer(input.value)
  if (!origin) return
  await requestAccess(origin)
  await showAccess(origin)
})

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  const origin = normalizeServer(input.value)
  if (!origin) {
    show(msg('invalidAddress'), true)
    input.focus()
    return
  }
  input.value = origin
  // First, while the click still counts as a gesture: access for screenshots.
  const access = requestAccess(origin)
  await ext.storage.sync.set({ server: origin })
  await access
  await showAccess(origin)
  if (!pending) {
    show(msg('saved', origin))
    return
  }
  await ext.windows.create({ url: buildShareUrl(origin, pending), type: 'popup', width: 480, height: 640 })
  const tab = await ext.tabs.getCurrent()
  if (tab?.id != null) await ext.tabs.remove(tab.id)
})

// Save modes and the token (OpenSpec change extension-v2, design D2). The mode
// syncs with the browser's settings; the token and what the server said about it
// stay in storage.local on this device.
const modeStatus = document.getElementById('mode-status')
const tokenForm = document.getElementById('token-form')
const tokenInput = document.getElementById('token')
const tokenStatus = document.getElementById('token-status')
const forget = document.getElementById('forget')

function note(el, message, error = false) {
  el.hidden = !message
  el.textContent = message
  el.classList.toggle('error', error)
}

async function showToken() {
  const s = await readSettings(ext)
  for (const r of document.querySelectorAll('input[name="mode"]')) r.checked = r.value === (s.mode === MODE_QUICK ? MODE_QUICK : MODE_CAPTURE)
  forget.hidden = !s.token
  if (s.token && s.account) note(tokenStatus, msg('tokenOk', s.account, s.scope))
  if (s.mode === MODE_QUICK && !scopeDecision(s.scope).save) note(modeStatus, msg('modeNeedsToken'), true)
  else note(modeStatus, '')
}
void showToken()

for (const r of document.querySelectorAll('input[name="mode"]')) {
  r.addEventListener('change', async () => {
    if (!r.checked) return
    await ext.storage.sync.set({ mode: r.value })
    await showToken()
  })
}

tokenForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  const { server: current } = await ext.storage.sync.get('server')
  const token = tokenInput.value.trim()
  if (!current) return note(tokenStatus, msg('tokenNoServer'), true)
  if (!tokenAllowed(current)) return note(tokenStatus, msg('tokenHttp'), true)
  if (!token) return
  // Access to the server's address, asked from this click (browsers require a gesture).
  const access = await requestAccess(current)
  if (!access) return note(tokenStatus, msg('tokenAccess'), true)
  note(tokenStatus, msg('tokenChecking'))
  try {
    const me = await createApi({ server: current, token }).me()
    const scope = me?.auth?.scope ?? ''
    const decision = scopeDecision(scope)
    if (!decision.parse) return note(tokenStatus, msg(decision.reason), true)
    const account = me?.user?.name || me?.user?.email || ''
    await ext.storage.local.set({ token, scope, account })
    tokenInput.value = ''
    note(tokenStatus, decision.save ? msg('tokenOk', account, scope) : msg(decision.reason), !decision.save)
  } catch (err) {
    note(tokenStatus, err?.kind === 'unreachable' ? msg('tokenUnreachable') : msg('tokenRejected', err?.message ?? ''), true)
  }
  await showToken()
})

forget.addEventListener('click', async () => {
  await ext.storage.local.remove(['token', 'scope', 'account'])
  note(tokenStatus, msg('tokenForgotten'))
  await showToken()
})

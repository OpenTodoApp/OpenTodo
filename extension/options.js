import { buildShareUrl, decodePending, normalizeServer, originPattern } from './share-url.js'

const ext = globalThis.browser ?? globalThis.chrome

const form = document.getElementById('form')
const input = document.getElementById('server')
const status = document.getElementById('status')
const pendingNote = document.getElementById('pending')

// First run: the page that was being captured rides along in this page's URL.
const pending = decodePending(location.search)
if (pending) {
  pendingNote.hidden = false
  pendingNote.textContent = `Set your server to continue adding "${pending.title || pending.url || 'this page'}".`
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
  shots.textContent = granted
    ? `Screenshots: allowed for ${origin}.`
    : 'Screenshots: not allowed yet. The extension needs access to your server only to hand a screenshot to the capture popup.'
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
    show('Enter an http:// or https:// address, for example https://todo.example.com', true)
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
    show(`Saved. Captures go to ${origin}.`)
    return
  }
  await ext.windows.create({ url: buildShareUrl(origin, pending), type: 'popup', width: 480, height: 640 })
  const tab = await ext.tabs.getCurrent()
  if (tab?.id != null) await ext.tabs.remove(tab.id)
})

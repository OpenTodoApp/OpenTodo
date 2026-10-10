import { buildShareUrl, decodePending, normalizeServer } from './share-url.js'

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

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  const origin = normalizeServer(input.value)
  if (!origin) {
    show('Enter an http:// or https:// address, for example https://todo.example.com', true)
    input.focus()
    return
  }
  input.value = origin
  await ext.storage.sync.set({ server: origin })
  if (!pending) {
    show(`Saved. Captures go to ${origin}.`)
    return
  }
  await ext.windows.create({ url: buildShareUrl(origin, pending), type: 'popup', width: 480, height: 640 })
  const tab = await ext.tabs.getCurrent()
  if (tab?.id != null) await ext.tabs.remove(tab.id)
})

// OpenTodo Capture: open the server's /share screen for the current tab.
// No fetch, no XHR, no host permissions: the only "network" activity is the popup
// window the user asked for, which loads the user's own server.
import { MAX_TEXT, buildShareUrl, encodePending, isWebUrl } from './share-url.js'

// Firefox exposes promise-based `browser`, Chromium promise-based `chrome`.
const ext = globalThis.browser ?? globalThis.chrome

const MENU_ID = 'opentodo-add'

ext.runtime.onInstalled.addListener(() => {
  ext.contextMenus.create({ id: MENU_ID, title: 'Add to OpenTodo', contexts: ['page', 'selection'] })
})

ext.action.onClicked.addListener((tab) => void capture(tab))

ext.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID) void capture(tab, info.selectionText)
})

/** Read the selection from the active tab; activeTab grants this on the user's click. */
async function selectionOf(tab) {
  if (tab?.id == null || !isWebUrl(tab.url)) return ''
  try {
    const [res] = await ext.scripting.executeScript({
      target: { tabId: tab.id },
      func: (max) => String(globalThis.getSelection?.() ?? '').slice(0, max),
      args: [MAX_TEXT],
    })
    return typeof res?.result === 'string' ? res.result : ''
  } catch {
    return '' // pages the browser protects (stores, settings) cannot be scripted
  }
}

/** Open the capture popup, or the options page first when no server is set. */
async function capture(tab, selectionText) {
  const page = {
    title: tab?.title ?? '',
    url: tab?.url ?? '',
    text: selectionText || (await selectionOf(tab)),
  }
  const { server } = await ext.storage.sync.get('server')
  if (!server) {
    // First run: the options page carries the capture in its own URL (never stored)
    // and continues to the capture screen once the server URL is saved.
    await ext.tabs.create({ url: `${ext.runtime.getURL('options.html')}?${encodePending(page)}` })
    return
  }
  await openCapture(buildShareUrl(server, page))
}

function openCapture(url) {
  return ext.windows.create({ url, type: 'popup', width: 480, height: 640 })
}

// Handle for automated checks from the service worker console; web pages cannot reach it.
globalThis.opentodoCapture = capture

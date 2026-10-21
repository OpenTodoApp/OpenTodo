// OpenTodo Capture: the toolbar button and the shortcut open the popup
// (popup.html, the manifest's default_popup); the context-menu entries hand what
// was clicked to the popup (OpenSpec change extension-v2, design D3), and the
// screenshot entry opens the server's /share screen as before. No fetch here: the
// only network code is api.js, used by the popup in Quick save mode.
import { PENDING_KEY, captureFromMenu, captureFromTab, descriptionOf } from './capture.js'
import { MAX_TEXT, buildShareUrl, encodePending, filesMessage, isWebUrl, originPattern, screenshotName } from './share-url.js'

// Firefox exposes promise-based `browser`, Chromium promise-based `chrome`.
const ext = globalThis.browser ?? globalThis.chrome

const MENU_ID = 'opentodo-add'
const SHOT_ID = 'opentodo-screenshot'

ext.runtime.onInstalled.addListener(() => {
  // Titles follow the browser's interface language (_locales; OpenSpec app-localization D10).
  ext.contextMenus.create({ id: MENU_ID, title: ext.i18n.getMessage('actionTitle'), contexts: ['page', 'selection', 'link', 'image'] })
  ext.contextMenus.create({ id: SHOT_ID, title: ext.i18n.getMessage('menuScreenshot'), contexts: ['page'] })
})

ext.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID) void fromMenu(info, tab)
  if (info.menuItemId === SHOT_ID) void screenshot(tab)
})

/**
 * Hand a context-menu capture to the popup: stored once in storage.session (kept
 * in memory, never written to disk), read and cleared by the popup. Where the
 * browser cannot open the popup from here, the capture screen opens instead.
 */
async function fromMenu(info, tab) {
  const page = captureFromMenu(info, tab)
  if (typeof ext.action.openPopup === 'function') {
    try {
      // Same tick: Firefox opens the popup only while the click is still the
      // user's gesture, and the storage write, queued first, lands before the
      // popup reads it.
      const stored = ext.storage.session.set({ [PENDING_KEY]: page })
      const opened = ext.action.openPopup()
      await Promise.all([stored, opened])
      return
    } catch {
      await ext.storage.session.remove(PENDING_KEY).catch(() => {})
    }
  }
  await capture(tab, page)
}

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

/** Open the capture screen window, or the options page first when no server is set. */
async function capture(tab, ready) {
  const c = ready ?? captureFromTab(tab, await selectionOf(tab))
  // An image's address leads the text, as in the popup.
  const page = { title: c.title, url: c.url, text: descriptionOf({ imageUrl: c.imageUrl, text: c.text, keepUrl: false }) }
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

/**
 * Capture the visible tab (allowed by activeTab on the user's click) and hand
 * the PNG to the capture popup on the user's server. Handing it over runs a
 * script in the popup, which needs the optional permission for the server's
 * origin; without it the popup opens with title and URL and says so.
 */
async function screenshot(tab) {
  const { server } = await ext.storage.sync.get('server')
  if (!server) return capture(tab)
  const page = { title: tab?.title ?? '', url: tab?.url ?? '', text: '' }
  let dataUrl = ''
  try {
    dataUrl = await ext.tabs.captureVisibleTab(tab?.windowId, { format: 'png' })
  } catch {
    return capture(tab) // pages the browser protects cannot be captured
  }
  const granted = await ext.permissions.contains({ origins: [originPattern(server)] })
  const win = await openCapture(buildShareUrl(server, page, granted ? '1' : 'denied'))
  const tabId = win?.tabs?.[0]?.id
  if (!granted || tabId == null) return
  const message = filesMessage(dataUrl, screenshotName())
  const deliver = async () => {
    try {
      await ext.scripting.executeScript({
        target: { tabId },
        // Runs in the popup: post until the capture screen says it took the file
        // (the app may still be loading or signing in); it accepts one message only.
        func: (msg) => {
          let tries = 0
          const post = () => {
            if (document.documentElement.dataset.opentodoFiles === 'received' || ++tries > 100) return
            window.postMessage(msg, location.origin)
            setTimeout(post, 300)
          }
          post()
        },
        args: [message],
      })
    } catch {
      // The popup was closed, or navigated somewhere else.
    }
  }
  const onUpdated = (id, info) => {
    if (id !== tabId || info.status !== 'complete') return
    ext.tabs.onUpdated.removeListener(onUpdated)
    void deliver()
  }
  ext.tabs.onUpdated.addListener(onUpdated)
}

// Handle for automated checks from the service worker console; web pages cannot reach it.
globalThis.opentodoCapture = capture
globalThis.opentodoScreenshot = screenshot

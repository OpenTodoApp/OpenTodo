// OpenTodo Capture: open the server's /share screen for the current tab.
// No fetch, no XHR, no host permissions: the only "network" activity is the popup
// window the user asked for, which loads the user's own server.
import { MAX_TEXT, buildShareUrl, encodePending, filesMessage, isWebUrl, originPattern, screenshotName } from './share-url.js'

// Firefox exposes promise-based `browser`, Chromium promise-based `chrome`.
const ext = globalThis.browser ?? globalThis.chrome

const MENU_ID = 'opentodo-add'
const SHOT_ID = 'opentodo-screenshot'

ext.runtime.onInstalled.addListener(() => {
  // Titles follow the browser's interface language (_locales; OpenSpec app-localization D10).
  ext.contextMenus.create({ id: MENU_ID, title: ext.i18n.getMessage('actionTitle'), contexts: ['page', 'selection'] })
  ext.contextMenus.create({ id: SHOT_ID, title: ext.i18n.getMessage('menuScreenshot'), contexts: ['page'] })
})

ext.action.onClicked.addListener((tab) => void capture(tab))

ext.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID) void capture(tab, info.selectionText)
  if (info.menuItemId === SHOT_ID) void screenshot(tab)
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

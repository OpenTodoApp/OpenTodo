# Capturing pages: share sheet, bookmarklet, extension

Many tasks start as "deal with this page later". OpenTodo can receive a page from three places, and all of them open the same **capture screen** at `/share` on your own server:

| From | How | Works offline |
| --- | --- | --- |
| Phone or desktop share sheet | Install the app, then choose **OpenTodo** in the share menu | Yes, once the app has been opened online |
| Any desktop browser | The bookmarklet from **Settings → Capture** | The popup opens from the app's offline cache once the app has been loaded in that browser |
| Chromium and Firefox | The browser extension in [`extension/`](../extension/) | Same as the bookmarklet |

The capture screen proposes:

- **Title**: the page title, or the link's host name when there is no title. The title field is a regular [quick-add](quick-add.md) line, so typing `tomorrow #work p1` into it sets the date, project and priority.
- **Description**: the selected or shared text, followed by the link.
- **Project**: the Inbox by default; pick any project.

Press **Enter** to save or **Esc** to cancel. Nothing is saved until you confirm. Saving creates an ordinary task on the device first and syncs it like any other quick-add task, so it works with no network and reaches your other devices when the network returns.

When the capture screen was opened as a popup (bookmarklet, extension) or in a window opened just for the share, it closes itself after Save or Esc. Otherwise it takes you to the Inbox or to the project you picked.

## Share sheet (installed app)

The web app manifest declares a [Web Share Target](https://developer.mozilla.org/docs/Web/Manifest/share_target) (`GET /share` with `title`, `text` and `url`). The browser adds OpenTodo to the share menu once the app is **installed**:

| Platform | Install | Share |
| --- | --- | --- |
| Android, Chrome / Edge / Samsung Internet | Menu → **Install app** (or **Add to Home screen**) | Share from any app → **OpenTodo** |
| Windows, ChromeOS, Chrome / Edge | Install icon in the address bar | Share from apps that use the system share dialog |
| macOS, Chrome / Edge | Install icon in the address bar | Support for receiving shares varies by version; use the bookmarklet or extension |
| iOS and iPadOS, any browser | Share → **Add to Home Screen** | Safari does not support share targets for web apps; use the bookmarklet in Safari instead |
| Firefox (all platforms) | Firefox does not install web apps as share targets | Use the extension or bookmarklet |

Some apps put the link inside the shared text instead of the link field. The capture screen then takes the last `http(s)` link from the text and moves it to the end of the description.

After an update that adds or changes the share target, the browser may need the app to be opened once (or reinstalled) before the share menu entry appears.

## Bookmarklet

**Settings → Capture** shows an **Add to OpenTodo** button generated for your server's address. Drag it to the bookmarks bar (or use **Copy bookmarklet** and paste the code as the address of a new bookmark). Clicking it on any page opens a small popup with the capture screen, prefilled with the page's address, title and the text you selected.

The bookmarklet contains no password or token. It only opens your server's `/share` page in a popup, where your normal sign-in applies. Its source, with your server's address in place of `https://todo.example.com`:

```js
javascript:(function () {
  var e = encodeURIComponent
  var s = String(window.getSelection ? getSelection() : '').slice(0, 16384)
  var u = "https://todo.example.com/share" + '?url=' + e(location.href) + '&title=' + e(document.title) + (s ? '&text=' + e(s) : '')
  if (!window.open(u, 'opentodo-capture', 'popup,width=480,height=640'))
    alert('Allow pop-ups for this site to capture it to OpenTodo.')
})()
```

If nothing happens, the browser blocked the popup: allow pop-ups for the site you are on. Some sites block bookmarklets with their own security policy; the extension works there.

## Browser extension

[`extension/`](../extension/) holds a small Manifest V3 extension for Chromium-based browsers (Chrome, Edge, Brave, Vivaldi) and Firefox 121 or later. It adds:

- a toolbar button **Add to OpenTodo**,
- a context-menu entry **Add to OpenTodo** on pages and selections,
- a keyboard shortcut, **Alt+Shift+O** by default (change it at `chrome://extensions/shortcuts` or in Firefox's **Manage Extension Shortcuts**).

Each opens your server's capture screen in a popup window with the current tab's address, title and selection.

**Install** (it is not published in the browser stores yet):

- *Chromium*: download `opentodo-browser-extension.zip` from a release (or run `make extension`), unzip it, open `chrome://extensions`, turn on **Developer mode**, **Load unpacked**, pick the unzipped folder.
- *Firefox*: open `about:debugging#/runtime/this-firefox`, **Load Temporary Add-on…**, pick `manifest.json` from the unzipped folder. Temporary add-ons are removed when Firefox restarts; a signed build is a release task.

**First use**: if no server is set, the extension opens its options page and asks for your server's address (for example `https://todo.example.com`). Once it is saved, the capture you started continues. Change it later in the extension's options.

**Privacy**: the extension stores only the server address (in the browser's extension sync storage). It holds no token or password, has no host permissions and no content scripts, and makes no network requests itself; the only traffic is the capture popup you open, which loads your own server. Permissions: `activeTab` (read the current tab's address, title and selection when you click), `contextMenus`, `scripting` (read the selection), `storage` (the server address).

## Signed out

If the device is not signed in, the capture screen first shows the sign-in form with a note, then continues to the capture screen with the shared page intact. Until you save, the shared title, text and link stay in the page's memory only: they are removed from the address bar and are not written to storage or sent to the server (the server's request log records paths, never query strings). Reloading the sign-in page therefore loses the shared content; share it again.

## Limits and safety

- The title is cut to 500 characters, the text to 16 KB with a `[truncated]` note.
- A link is kept only if it starts with `http://` or `https://`; anything else (`javascript:`, `data:`, `file:` …) is dropped and the rest of the share is shown normally.
- Shared content is shown as plain text, never as HTML, and the capture screen never opens the shared link.
- There is no auto-save: a link to `/share` cannot create a task without you pressing Save.
- Files and images cannot be shared yet; the app is offered in the share menu for text and links only.

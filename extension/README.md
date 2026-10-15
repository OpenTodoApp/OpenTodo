# OpenTodo Capture (browser extension)

A small Manifest V3 extension for Chromium-based browsers and Firefox 121+ that sends the current page to your own OpenTodo server's capture screen (`/share`). Plain JavaScript, no build step, no dependencies. User documentation: [docs/capture.md](../docs/capture.md).

- Toolbar button, context-menu entry **Add to OpenTodo** and the shortcut **Alt+Shift+O** open `/share?title=…&text=…&url=…` on the configured server in a popup window.
- Context-menu entry **Add screenshot to OpenTodo**: captures the visible tab with `tabs.captureVisibleTab` (allowed by `activeTab` on the click), opens the popup with `files=1`, and posts the PNG into it with `scripting.executeScript` and `window.postMessage({type: 'opentodo-files', files: [{name, type, data}]}, location.origin)`. The capture screen accepts that message once, only when opened with `files=1`, and only from its own window and origin. Posting into the popup needs access to the server's origin: declared under `optional_host_permissions` and requested for that origin alone from the options page when the server is saved (or with **Allow screenshots** later). Without it the popup opens with `files=denied` and explains.
- On first use (no server set) the options page opens; the capture continues once the server is saved. The pending page rides along in the options page's URL and is never stored.
- Stores only the server origin in `storage.sync`. No token, no content scripts, no `fetch`: the extension makes no network requests of its own and opens no connections while idle.
- Permissions: `activeTab`, `contextMenus`, `scripting`, `storage`; optional host access to the configured server's origin only.

## Files

| File | Purpose |
| --- | --- |
| `manifest.json` | MV3 manifest (`background.service_worker` for Chromium, `background.scripts` for Firefox) |
| `background.js` | Action, context menu and command handlers; reads the selection and hands a screenshot to the popup with `scripting.executeScript` |
| `share-url.js` | Pure helpers: server URL validation, the `/share` URL builder, the screenshot hand-over message |
| `options.html`, `options.js` | Server URL setting and the screenshot permission |
| `share-url.test.js`, `package.json` | `node --test` unit tests; not shipped in the zip |

## Develop

```sh
node --test extension/share-url.test.js   # or: make test-extension
make extension                             # tests + manifest check + dist/opentodo-browser-extension.zip
```

Load unpacked: `chrome://extensions` → Developer mode → **Load unpacked** → this folder. Firefox: `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → `manifest.json`.

CI builds the zip on every push and attaches it to tagged releases. Publishing to the Chrome Web Store and addons.mozilla.org is a separate release step.

Keep `share-url.js` in step with `web/src/lib/share.ts` (limits and the `/share` parameters); the app re-validates everything it receives.

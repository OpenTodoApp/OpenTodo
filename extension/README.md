# OpenTodo Capture (browser extension)

A small Manifest V3 extension for Chromium-based browsers and Firefox 121+ that sends the current page to your own OpenTodo server's capture screen (`/share`). Plain JavaScript, no build step, no dependencies. User documentation: [docs/capture.md](../docs/capture.md).

- Toolbar button, context-menu entry **Add to OpenTodo** and the shortcut **Alt+Shift+O** open `/share?title=…&text=…&url=…` on the configured server in a popup window.
- On first use (no server set) the options page opens; the capture continues once the server is saved. The pending page rides along in the options page's URL and is never stored.
- Stores only the server origin in `storage.sync`. No token, no host permissions, no content scripts, no `fetch`: the extension makes no network requests of its own and opens no connections while idle.
- Permissions: `activeTab`, `contextMenus`, `scripting`, `storage`.

## Files

| File | Purpose |
| --- | --- |
| `manifest.json` | MV3 manifest (`background.service_worker` for Chromium, `background.scripts` for Firefox) |
| `background.js` | Action, context menu and command handlers; reads the selection with `scripting.executeScript` |
| `share-url.js` | Pure helpers: server URL validation and the `/share` URL builder |
| `options.html`, `options.js` | Server URL setting |
| `share-url.test.js`, `package.json` | `node --test` unit tests; not shipped in the zip |

## Develop

```sh
node --test extension/share-url.test.js   # or: make test-extension
make extension                             # tests + manifest check + dist/opentodo-browser-extension.zip
```

Load unpacked: `chrome://extensions` → Developer mode → **Load unpacked** → this folder. Firefox: `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → `manifest.json`.

CI builds the zip on every push and attaches it to tagged releases. Publishing to the Chrome Web Store and addons.mozilla.org is a separate release step.

Keep `share-url.js` in step with `web/src/lib/share.ts` (limits and the `/share` parameters); the app re-validates everything it receives.

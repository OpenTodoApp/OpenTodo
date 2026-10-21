# OpenTodo Capture (browser extension)

A small Manifest V3 extension for Chromium-based browsers and Firefox 128+ that adds the current page, a link, an image, a mail message or the selected text to your own OpenTodo server. Plain JavaScript, no build step for the code, no dependencies. User documentation: [docs/capture.md](../docs/capture.md#browser-extension). Its own version and history: [CHANGELOG.md](CHANGELOG.md).

- The toolbar button and **Alt+Shift+O** open the popup (`popup.html`): one quick-add line prefilled from the tab, a project and a label picker, the page as the origin, and **Save**.
- **Add to OpenTodo** in the context menu of pages, selections, links and images stores what was clicked in `storage.session` and opens the popup in the same tick (`action.openPopup()`); where that fails, the capture screen opens directly.
- **Add screenshot to OpenTodo** captures the visible tab and posts the PNG into the server's capture screen, as before (needs the optional access to the server's origin).
- A message open in Gmail or Outlook on the web (`mail.js`): the subject from the tab title, the permalink and id from the address, the sender from one `executeScript` on the click. Never the message body; no permission for any mail host.

## Two modes

| | Capture screen (default) | Quick save |
| --- | --- | --- |
| Save | Opens `/share?title=…&text=…&url=…` on the server in a popup window | `POST /api/v1/tasks` with the token, then the parse's reminders and tracked time as `ot add --natural` does |
| Preview | None (the capture screen parses) | Chips from `POST /api/v1/quick-add/parse`, 150 ms after typing stops |
| Stored | Server address and mode (`storage.sync`) | Also the token, its scope and account name (`storage.local`, never synchronised) |
| Requests by the extension | None | Only to the server's origin, bearer token, `credentials: 'omit'`, 10 s timeout, an `Idempotency-Key` per popup opening |

Quick save needs a `full` or `admin` token over `https` (or `http://localhost` / `127.0.0.1`) and the optional host permission for the server's origin. A `read` token previews only; an `agent` token is refused. Any failure keeps the text and offers **Open capture screen**.

## Files

| File | Purpose |
| --- | --- |
| `manifest.src.json` | The one source manifest; `build.mjs` writes the Chrome and Firefox forms |
| `background.js` | Context-menu entries, the hand-over to the popup, the capture-screen fallback, the screenshot |
| `capture.js` | Pure: what a click captures (page, selection, link, image) and the description |
| `popup.html`, `popup.css`, `popup.js` | The popup page (360 px, light and dark) |
| `popup-state.js` | Pure: prefill, origin, the task body, reminders, tracked time, the save order, failures, debounce |
| `api.js` | The only network code: the client for one server and token |
| `mail.js` | Pure: Gmail and Outlook recognition, the header selector table |
| `settings.js` | Pure: where settings live, which addresses may get a token, what each scope allows |
| `share-url.js` | Pure: server URL validation, the `/share` URL, the screenshot message |
| `options.html`, `options.js` | Server address, mode, token (check, save, forget), screenshot permission |
| `_locales/` | Texts in six languages (`locales.test.js` checks keys and placeholders) |
| `build.mjs` | Builds both packages; refuses host permissions, content scripts or a version missing from `CHANGELOG.md` |
| `store/` | Store listings in six languages, `privacy.md` (a justification per permission), `screenshots.md` |
| `testdata/mail/` | Mail fixtures (synthetic, `example` domains); see its README to refresh them |
| `*.test.js`, `package.json` | `node --test` unit tests; not shipped |

## Develop

```sh
make test-extension            # the unit tests (cd extension && npm test)
make extension                 # tests, both packages in dist/, web-ext lint of the Firefox package
node extension/build.mjs --dev # also writes extension/manifest.json to load this folder unpacked
```

Load unpacked: `chrome://extensions` → Developer mode → **Load unpacked** → `dist/extension-chrome/` (or this folder after `--dev`). Firefox: `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → `dist/extension-firefox/manifest.json`. `extension/manifest.json` is git-ignored.

Keep `share-url.js` in step with `web/src/lib/share.ts` (limits and the `/share` parameters); the app re-validates everything it receives. The parse route and the quick-add grammar live on the server (`internal/httpapi/quickadd.go`, `internal/quickadd`): the extension carries no parser.

## Release checklist

1. Bump `version` in `manifest.src.json` and add the matching entry at the top of `CHANGELOG.md` (the build fails otherwise).
2. `make extension`: tests, both packages, no lint error.
3. Chrome Web Store: upload `dist/opentodo-browser-extension-chrome.zip`; paste the listing from `store/listing.<lang>.md` per language; answer the privacy tab and the permission justifications from `store/privacy.md`; upload the shots listed in `store/screenshots.md`.
4. addons.mozilla.org: upload `dist/opentodo-browser-extension-firefox.zip` with the same texts; the review notes are `store/privacy.md`.
5. Once a listing is live, link it from `docs/capture.md`.

CI builds and lints both packages on every push and attaches both zips to tagged releases.

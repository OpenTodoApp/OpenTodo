# Proposal

## Why

The browser extension (`extension/`) only opens the server's capture screen with the current tab's address, title and selection: every capture is a popup window, a sign-in check, a form and a Save, with no project choice before the window opens, no understanding of "tomorrow #work p1" until the window has loaded, and nothing for a link, an image or an open email. It is also not in the Chrome Web Store or on addons.mozilla.org (ROADMAP.md "Future ideas": *Published browser extension*), so installing it means unzipping a release asset and loading it unpacked, which Firefox forgets at every restart. The pieces to do better now exist: the Go quick-add port (`internal/quickadd`, pinned to the web parser by shared vectors), `task.origin` with issue recognition (`task-origin`), API tokens with scopes, and the optional per-origin permission the screenshot hand-over already asks for.

## What Changes

- **A toolbar popup.** Clicking the toolbar button (or the shortcut, Alt+Shift+O by default) opens a small popup inside the browser, not a new window: one quick-add line prefilled from the page (title, or the selection as the first line), a project and a label picker, a one-line preview of what the line sets (chips for the date, project, labels, priority, estimate, recurrence and reminders, in the account's language), the page link shown as the task's origin, and **Save**. The popup works in two modes, chosen on the options page:
  - **Capture screen** (the default, unchanged behaviour): Save opens the server's `/share` screen as today, with the line carried as the title. No token, no requests from the extension.
  - **Quick save**: with an API token the user pastes on the options page and access to the server's address, Save creates the task straight through `POST /api/v1/tasks` with the page as its origin, the parse's reminders and tracked time added as the CLI does, and the popup confirms with a link to the task. When the server cannot be reached, the token is refused or the user is signed out of nothing (a token needs no session), the popup keeps the text and offers the capture screen, which works from the app's offline cache.
- **Parsing on the server.** A new read route, `POST /api/v1/quick-add/parse`, runs the same quick-add grammar as the app (the Go port, shared vectors) with the account's languages, date and week-start preferences, projects and labels, and answers the fields the line sets, the chips to show, the unmatched tokens, and the recognised origin of a given page address. The popup calls it while the user types (debounced, Quick save mode only) and never parses itself; in Capture screen mode the app parses in the capture screen as today.
- **Context menu on more things.** "Add to OpenTodo" appears on a page, a selection, a link (the link's text becomes the title and its address the origin) and an image (the image's address goes into the description as a link; the image is never fetched by the extension). "Add screenshot to OpenTodo" stays as it is.
- **Open mail messages are recognised.** On Gmail (`mail.google.com`) and Outlook on the web (`outlook.office.com`, `outlook.live.com`), the subject of the open message becomes the title, the message's permalink (the tab's own address) the origin, and the sender's name and address the first line of the description. The extension reads only the tab's title and, on the user's click, the message header through `activeTab`; it never reads the message body and holds no host permission for any mail host. The origin is an **email** origin with a link, shown as **Gmail** or **Outlook** in the app, and the chip opens the message. GitHub, GitLab, Jira and Linear issues are recognised by the server's parse route (`internal/origin`), so the extension carries no second copy of the recogniser.
- **Store readiness.** `make extension` produces two zips, one for the Chrome Web Store and one for addons.mozilla.org, from one source manifest; a CI check lints both packages and refuses a build whose version is not described in the extension's own changelog. The repository gains the store listing texts in the six shipped languages, a privacy disclosure that matches the manifest ("the extension talks only to the server address you enter"), the list of screenshots to upload, and a release checklist in the extension's README. Publishing itself stays a maintainer step; the user guide gains the store links once the listings exist.
- **Translations.** Every new text of the popup, the context menu entries and the options page is in the six `_locales` catalogs, checked by the existing locales test, and the popup follows the browser's interface language while the chips it shows from the parse route follow the account's language.

Out of scope: a Safari extension; reading or summarising page content; the in-app assistant in the popup; an offline outbox in the extension (a save that cannot reach the server falls back to the capture screen, which is offline-capable); attaching images from pages (the share target and the screenshot entry cover files); recognising mail clients other than Gmail and Outlook on the web (Fastmail, Proton and self-hosted webmail are a follow-up with the same module); the capture screen itself (unchanged); any change to the op log or to sync.

ROADMAP.md: advances the "Future ideas" item **Published browser extension** and the `share-capture` capability. No new environment variable, no op-log change, no new mandatory configuration.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `share-capture`: "Browser extension" (two modes, the popup, the token, the wider context menu), "Browser extension language" (the popup and its chips), plus added requirements for the popup, quick save, the parse preview, the context menu entries, mail message recognition, extension privacy with a token, and store packaging.
- `http-api`: an added requirement for the quick-add parse route (`POST /api/v1/quick-add/parse`), with authentication, scope, limit and error scenarios.
- `task-management`: "Task origin" gains the mail-message form of the `email` origin (a link and a provider), and "Origin validation" names the providers it accepts for it.

## Impact

- `extension/`: new `popup.html`, `popup.js`, `popup.css`, `api.js` (the only file that uses `fetch`), `mail.js` (Gmail and Outlook subject, sender and permalink from the tab title and the message header), `manifest.src.json` and a tiny `build.mjs` that writes the Chrome and the Firefox manifest, store texts under `extension/store/`, `extension/CHANGELOG.md`; `background.js`, `options.html`, `options.js`, `share-url.js` and the six `_locales` catalogs change; `locales.test.js` covers the new files; new `node --test` files for the popup state, the mail module (fixtures) and the build.
- Server: `internal/httpapi/quickadd.go` (one route, `signedIn` with read tokens allowed, per-user rate limit), reusing `internal/quickadd` (already linked into the server through the importer) and `internal/origin`; `router.go`, `policy_test.go`, `docs/api.md`. Binary size effectively unchanged (the packages are already linked); runtime memory unchanged.
- Web app: the origin chip and the panel learn the `email` origin with a link (`web/src/lib/taskOrigin.ts`, the chip component), and the capture screen accepts a `mode=popup` hint only to close itself after Save as it does for popups today. No new dependency in `web/`.
- Makefile (`extension` target builds two zips and runs the lints), `.github/workflows/ci.yml` (the extension job uploads both zips and runs `web-ext lint` from a pinned `npx` call, no new dependency in `package.json`), `scripts/repo-checks.test.mjs` if it lists the extension's files.
- Docs: `docs/capture.md` (popup, modes, token, context menu, mail, store install), `docs/api.md` (the parse route), `extension/README.md` (files, build, release checklist), `CHANGELOG.md`.
- Extension zip: from about 24 KB to about 60 KB (popup, API client, mail module, store texts are not in the zip). No runtime dependency; `web-ext` is a pinned development tool run from `npx` in CI and `make extension`.

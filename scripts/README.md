# scripts

## `cli-smoke.sh`

End-to-end check of the `ot` command-line client: starts `bin/opentodo` on a throwaway port and data directory, creates the owner account, then runs `ot login`, `project add`, `add`, `list --json`, `done` (by id prefix), the exit-code contract, `export` and `auth logout`. Prints `CLI OK` on success; CI runs it in the server job.

```bash
make cli-smoke                 # builds bin/opentodo and bin/ot, then runs the script
OPENTODO_SMOKE_PORT=18081 ./scripts/cli-smoke.sh
```

## `e2e-smoke.mjs`

Drives the production binary in headless Chromium through the whole walking skeleton: owner setup, capture, natural-language quick add (preview chips, then the parsed date and priority checked on the server), projects, detail edits, keyboard shortcuts, views, sync verified through the REST API, a second device, an offline edit that uploads on reconnect, settings and tokens, mobile layout. Selectors are scoped by role and label (a task row is the button whose name starts with its title; detail fields are looked up inside the detail panel), so the Parent task picker and subtask lists never make them ambiguous. Pass a directory as the first argument to also save screenshots of the run.

Run it against a **fresh** data directory (the script creates the owner account):

```bash
make build
OPENTODO_DATA_DIR=$(mktemp -d) ./bin/opentodo &
npm i -g playwright@1.56.1 && npx playwright install chromium   # once
node scripts/e2e-smoke.mjs [screenshot-dir]
# or, with a Chromium already on disk:
CHROMIUM_PATH=/path/to/chrome node scripts/e2e-smoke.mjs
```

Environment: `OPENTODO_URL` (default `http://127.0.0.1:8080`), `CHROMIUM_PATH` (optional). Exit code is non-zero on any failed step or browser console error.

## `e2e-views.mjs`

Browser check of saved views and dashboards (OpenSpec change `custom-views`) with two devices (two browser contexts on one account): saving from the Filter view with `s`, editing the query, grouping by due date and sorting, sidebar order and counts on both devices, unpin and the `g v` overview, a dashboard with three panels (Tab / Shift+Tab, live counts, the "View removed" placeholder, stacking at phone width), the per-device start view and its fallback after a deletion elsewhere, and a view saved offline on one device, then edited offline on both, converging after reconnect. Seeds its data through the REST API. Run it against a **fresh** data directory like the smoke test; pass a directory to also save screenshots:

```bash
make build
OPENTODO_DATA_DIR=$(mktemp -d) ./bin/opentodo &
npm i -g playwright@1.56.1 && npx playwright install chromium   # once
node scripts/e2e-views.mjs [screenshot-dir]
# or, with a Chromium already on disk:
CHROMIUM_PATH=/path/to/chrome node scripts/e2e-views.mjs
```

## `upgrade-check.mjs`

Upgrade check from real data of released versions (`make upgrade-check`; the nightly workflow, and pull requests touching `internal/store`, `internal/sync` or `internal/auth`). For each release (default: the three newest and v0.6.1, the oldest with a server binary; or `UPGRADE_FROM="v0.9.0 v0.13.0"`, or versions as arguments) it downloads `opentodo-linux-amd64` from the GitHub release into `.cache/releases`, checks it against the release's `SHA256SUMS`, starts it on a fresh data directory and writes an account's data through its own API: the owner, a full API token, projects (one nested, non-ASCII name), a section, a label, tasks with due time, labels, estimate and deadline, a subtask, a completed and a deleted task, a comment and a saved view, all as sync ops. It keeps the export and the full op log the release returns, stops it, and starts the server under test (`OPENTODO_BIN`, default `bin/opentodo`) on the same directory. It fails unless the schema reaches this build's newest migration, the token and the password still work, every exported row and field and every op read back unchanged (fields the new build adds are allowed), and a new write is accepted.

```bash
make upgrade-check                      # or: node scripts/upgrade-check.mjs v0.13.0
```

## `e2e-network.mjs`

Network audit for locations and maps (OpenSpec change `task-locations`, task 7.1), run by `make e2e`. It starts a fake tile and Photon provider on localhost and two fresh servers of its own (`OPENTODO_BIN`, default `bin/opentodo`), one with `OPENTODO_MAPS=off` and one with maps on, both pointed at the fake with `OPENTODO_MAPS_TILES_URL` and `OPENTODO_MAPS_GEOCODER_URL`, so nothing reaches OpenFreeMap or Photon. In each it opens a task with a location, its location editor (searching an address when maps are on) and the Locations page, and fails when the browser contacts any origin but the server's, when the server contacts the provider with maps off, or when a provider request with maps on lacks OpenTodo's User-Agent or carries the viewer's cookie, token or address. The map draws through SwiftShader WebGL, so tiles are really requested.

```bash
make web && go build -o bin/opentodo ./cmd/opentodo
node scripts/e2e-network.mjs
```

## `e2e-layout.mjs`

Layout check (OpenSpec change `mobile-layout`), run by the `layout` CI job: seeds a fresh server through the API, then opens every screen (Inbox, Today, Upcoming, Assigned, Day, Week, Completed, Filter, Trash, Activity, a project in list and board layout, a saved view, a dashboard, a label, Labels, Views, Settings, Import, sign-in) and every overlay reachable from it (notifications, keyboard help, the sidebar drawer and its view menu, the task panel, the label, assignee and mention pickers, the reminder toast, the project, section, label and view menus, share, rename and new-dashboard prompts, voice consent, the delete-account confirmation) at 360, 390 and 768 px, light and dark, in Chromium and WebKit, with a touch screen. It fails when a page scrolls sideways outside a `data-scroll-x` region, an overlay or its close control is outside the viewport or covered, an overlay does not close with Escape, its close button or a tap outside, focus does not return to the trigger, scrolling inside an overlay moves the page behind (Chromium; mobile WebKit has no wheel events), or a control is smaller than 44 × 44 px or only visible on hover. Each failure names screen, overlay, viewport, theme and engine, with a screenshot in the report directory.

```bash
make layout-check              # builds, starts a throwaway server on :18080, runs the check
# or against a running server with a FRESH data directory:
npm i -g playwright@1.56.1 && playwright install chromium webkit   # once
node scripts/e2e-layout.mjs [report-dir]
```

Environment: `OPENTODO_URL`, `ENGINES` (default `chromium,webkit`), `WIDTHS` (`360,390,768`), `THEMES` (`light,dark`), `ONLY` (screen names), `CONCURRENCY` (3), `SHOTS=all` (also save a screenshot of every screen and overlay), `CHROMIUM_PATH`, `WEBKIT_PATH`, `OPENTODO_LANG` (an interface language such as `de`: the run writes the synced language preference before capturing, to find labels that a longer translation makes overflow). When you add a screen or an overlay, add it to the `screens()` and `OVERLAYS` tables in `scripts/ux-audit/layout-screens.mjs` and an entry to the screen inventory. The seed (`ux-audit/seed.mjs`), the screens and overlay openers (`ux-audit/layout-screens.mjs`) and the page measurements (`ux-audit/measure.mjs`) are shared with the interface audit. With `OPENTODO_LANG` set to another language, each screen is checked once a heading, a task row or an alert shows, without its overlays or layout switches (their openers find controls by English names); CI runs a German leg at 360 px.

Every screen, and every overlay on its own, is also run through axe-core in light and dark; serious and critical issues (colour contrast below WCAG AA, missing names and labels, invalid roles or ARIA) fail the check. The check also covers the in-app Help (OpenSpec change `user-documentation`): Help is opened offline from the service worker's precache (Chromium), and the contextual help panel is opened over the share dialog with an email typed into it, which must still be there after the panel closes. axe-core comes from `web/node_modules` (run `npm ci` in `web/`); the context uses `bypassCSP` so it can be injected.

## `ux-audit/`

The interface audit (OpenSpec change `ux-audit-three-widths`); what it measures is in [Design system](../docs/design-system.md#the-interface-audit).

- `screens.json`: the screen inventory, one entry per screen or overlay: `id`, `route` (a router view), `kind` (`screen`, `overlay`, `settings`, `signed-out`, `display`), `seed`, `frequency` (`daily`, `weekly`, `rare`), `core` (true exactly for daily and weekly), `layoutCheck` (the layout check's screen name or overlay key) or `layoutCheckReason` with `path` and `ready` (a CSS selector), `story` (the story title that shows it), and for overlays `on` (the screen it opens on) and `open` (`overlay`, a layout-check opener, and `steps`: `click`, `clickIfVisible`, `focus`, `type`). `tour: false` marks the two entries no tour can reach.
- To add a route: add its entry; if the layout check opens it, name its screen; otherwise give the reason, a `path` (`{home}`, `{quotes}` and the other seed ids are filled in) and a `ready` selector. Mark it daily or weekly only if it is, and then give it a story.
- `ux-audit.test.mjs` (in `make ui-lint`): every router view has an entry, every `layoutCheck` name exists, `core` matches the frequency, overlays say how they open, and `screens.mjs` shots name inventory entries; plus the report's ranking.
- `stories.mjs` (in `make ui-lint`): every core entry's story title exists.
- `tour.mjs`, `report.mjs`, `audit-measures.mjs`, `measure.test.mjs` (fixture tests in Chromium, run by the CI job).
- `settings-heights.mjs` (OpenSpec change `settings-subpages`): the height of every Settings section and sub-page at 1280×800 and 390×844, as the owner of a throwaway server with every owner feature on, as a Markdown table. `TEXT_SIZE`, `SHOTS=<dir>` (a screenshot of each whole page), `THEME=dark`, `JSON=1`, `LIMIT` and `STRICT=1` (exit 1 when a page is taller than `LIMIT` screens, 1.5 by default).

```bash
make ux-audit                                        # builds, runs the tour, prints the report path
ONLY=inbox,today WIDTHS=1280 LANGS=en node scripts/ux-audit/tour.mjs   # a quick local look
```

Environment: `OUT_DIR` (`ux-audit-report`), `ONLY`, `WIDTHS` (`360,768,1280`), `THEMES` (`light,dark`), `LANGS` (`en,de`), `CONCURRENCY` (2), `CHROMIUM_PATH`, `OPENTODO_BIN` (`bin/opentodo`), `UX_AUDIT_STRICT=1`.

## `caldav-clients/`

The CalDAV verification scenario against real clients (OpenSpec change `caldav-interop`, task 5.2); its results are the rows of the verification table in [Calendar apps](../docs/caldav.md#limits). `run.sh` starts a fresh server on port 18080 with CalDAV on, a recording proxy on 18081 (every request and answer in `$WORK/traffic.jsonl`, the source of the fixtures in `internal/caldav/testdata/<client>/`), then drives the client and prints one `PASS`/`FAIL` line per check: served due forms, deadlines, date shapes, estimates, alarms, completing a repeating task, moves, deletion and incremental sync. Server state is read back through the REST API.

- `thunderbird`: downloads Thunderbird from Mozilla into `$WORK` and runs it headless with Marionette (`mn.py`); `tblib.js` calls its CalDAV provider through the item APIs its task list and task dialog use. Linux only.
- `todoman`: todoman edits a local vdir and vdirsyncer syncs it (both installed into a venv in `$WORK`; `tm.sh` holds their configuration).

```bash
make build && scripts/caldav-clients/run.sh thunderbird
scripts/caldav-clients/run.sh todoman
```

Environment: `OPENTODO_BIN` (`bin/opentodo`), `WORK` (`/tmp/opentodo-caldav-clients`). Needs `python3` with `venv`, `curl` and `fuser`. Not part of CI: it downloads a client and takes a few minutes.

## `e2e-docs.mjs`

Browser check of the docs website (OpenSpec change `user-documentation`), also run by the `docs-site` CI job: builds it into `dist/docs-root/docs` and serves it like the website's nginx does and opens a sample of pages at 360, 390 and 1280 px in light and dark. It fails on sideways scrolling, on serious or critical axe-core issues, when searching "recurring" does not list the recurring guide and the rule or quick add reference, when the result count is not announced or a result does not open with the keyboard, and when a page without JavaScript lacks its heading or working navigation (the search form must be hidden then). Third-party requests (fonts, analytics) are blocked, so the pages must work without them.

```bash
make docs-site-check           # or: node scripts/e2e-docs.mjs [report-dir]
```

Environment: `PAGES` (comma-separated paths), `WIDTHS` (`360,390,1280`), `CHROMIUM_PATH`.

## `docs-screenshots.mjs`

Captures the user guide's screenshots (`docs/images/<name>-{light,dark}.webp`, plus small `card-<name>-*.webp` thumbnails for the docs landing page) from the seeded demo data. It starts two throwaway servers from a binary itself: a demo instance (`OPENTODO_DEMO=true`, one sandbox, the demo banner hidden) for everyday screens and a fresh ordinary instance for sign-in, settings and sharing screens the demo switches off. Desktop shots are 1200×760 at 1.25×, phone shots 390×780 at 1.5×, WebP quality 0.72, encoded by Chromium; the whole set is about 2.3 MB. `make docs-screenshots` builds the web app and a binary that reports the latest released version, runs the script, then `make docs`.

```bash
make docs-screenshots
OPENTODO_BIN=bin/opentodo node scripts/docs-screenshots.mjs [name,name]   # a subset
```

## `screenshots.mjs`

Seeds a fresh server with realistic demo data (three accounts, shared projects, sections, subtasks, comments, reminders, saved views, settings) and captures the screenshots used by `README.md` (`docs/screenshots/*.png`) and the website (`docs/screenshots/site/*.webp`, shipped in the site bundle as `shots/`). Run it against an **empty** data directory; see [`website/README.md`](../website/README.md#refresh-the-screenshots) for the full recipe.

## `release-notes.sh`

Prints the `CHANGELOG.md` section for a version, plus install pointers; the release job in CI uses it as the GitHub release body and fails the release when the section is missing.

```bash
./scripts/release-notes.sh 0.2.0
```

## `demo-gif.mjs`

Records the demo GIF at the top of `README.md` (`docs/screenshots/demo.gif`): natural-language quick add with its chips, a card moved across a project board, and a task added offline that syncs on reconnect. Needs `ffmpeg` and a **fresh** data directory:

```bash
make build
OPENTODO_DATA_DIR=$(mktemp -d) ./bin/opentodo &
node scripts/demo-gif.mjs [out.gif]
```

## `i18n-check.mjs` and `i18n/`

Translation checks (OpenSpec change `app-localization`, design D8; see [docs/translating.md](../docs/translating.md)).

- `node scripts/i18n/extract.mjs --write` collects every message the web app passes to `t()`, `t.rich()`, `<T>` and `msg()` (and the server error table) into `web/src/locales/messages.json`, the translators' source list. Run it after adding or changing a message; `make i18n-check` fails while the list is stale.
- `node scripts/i18n-check.mjs` (`make i18n-check`, part of `make check`) checks every catalog in `web/src/locales/`: each source message has an entry and no entry is unused, every message parses, a translation keeps the source's placeholders, tags and plural/select arguments and uses only plural categories its language has, and a "Settings → …" path names the translated sections. A catalog not yet listed in `web/src/locales/index.ts` only gets a summary line ("pl: 412 of 3550").
- `scripts/i18n/untranslated.mjs` is the untranslated-string pass of `make ui-lint`: English text in JSX, in props people read or hear (`aria-label`, `title`, `placeholder`, `label`, …) or rendered as a child in `web/src/app` and `web/src/ui` fails with `file:line`. `scripts/i18n/allow.txt` lists the permanent exceptions (proper nouns, key names, samples).

```bash
make i18n-check                                   # script tests, then the catalog check
node --test scripts/i18n/*.test.mjs scripts/i18n-check.test.mjs
```

## Context

Settings → About (`web/src/app/AboutSection.tsx`) is one page: version, Help, docs, website, GitHub issues, Discord, a row labelled News and updates that opens X, source, the welcome note, and the coffee button. Search finds that X row under "news". The sidebar destination Updates is the activity feed and is unrelated. `CHANGELOG.md` is the long form. The app's first load is budgeted (`web/bundle-budget.json`, 749 KB gzip). Help already stays English and says so (`localization`).

There is no update check and no phone-home. This change keeps it that way: news is a file in the repo, compiled like the template library (`make templates` → `web/src/generated/templates.json`).

## Goals / Non-Goals

**Goals:**

- A person can read what changed in the version they are running, without the app contacting anyone.
- The "something is new" mark is one switch, on this device, off in one tap.
- A release that has a changelog section also has a short entry, from the first version that starts the series.

**Non-Goals:**

- Translating entry bodies. Fetching releases. A dialog on Today. A dot on the main sidebar. An owner switch to hide news on a branded server. Syncing "seen". Backfilling old versions.

## Decisions

### D1. Files, compiled, loaded with About

`news/<version>.md` is front matter (`version`, `date`) and at most four plain sentences. `scripts/news-build.mjs`, the same shape as `scripts/templates-build.mjs`, writes `web/src/generated/news.json`. `make news-check` fails when the generated file is stale, when an entry is missing its version or date, when two entries share a version, or when a `## [x.y.z]` changelog section newer than the first news file has no `news/x.y.z.md`. Versions before that first file are exempt, so history is not backfilled. An empty `news/` directory is valid; the card then shows the empty line and no dot.

The card imports the JSON from the About module. About is already part of Settings, which loads with the shell, but the JSON and the card body load with a `lazy()` import on first open of About, the way Help loads. The shell only needs enough to draw the About row's dot: a tiny module that reads the newest version id from a generated one-line export, not the bodies. If the measured first load grows past the budget, raise it in the same change and say why; the expectation is well under 1 KB, because the bodies stay lazy.

The changelog link is `https://github.com/OpenTodoApp/OpenTodo/releases/tag/v<version>`. It is an ordinary link, like the other About links.

Alternative considered: a sub-page `/settings/about/news`. About has no `pages` today. Giving it pages would replace the current cards with an overview (`visiblePages`). Rejected. The card stays on the About page.

Alternative considered: markdown rendering. The bodies are four sentences. Plain text needs no parser.

### D2. The dot and the switch are device-local

Two `localStorage` keys, the same kind of device flag as the Vim preference (`web/src/app/vim/prefs.ts`):

- `ot:news-seen` — the version string last opened.
- `ot:news-notify` — absent or `"1"` means on. `"0"` means off.

The dot shows when notify is on, `auth/status` has reported a version, that version equals an entry, and it differs from `ot:news-seen`. Opening the card writes `ot:news-seen` to the reported version, or to the newest entry's version when the server version is unknown. Nothing is written to the server, so there is no op and nothing to converge. A new device, or a new browser, shows the dot again. That is accepted.

The switch is the first row of the card, label "Version notices" (two words; the settings-copy limit is four). Description states that a dot appears when this version has notes not yet opened. Default on.

The dot is the design-system quiet dot, on the What's new card and on the About row in the settings pane (wide and phone lists). Its accessible name says there are new notes. It is not a count.

### D3. English bodies

The chrome goes through `t()` and the catalogues. The body is rendered as shipped, not looked up in a catalogue. When `currentLanguage()` is not English and there is an entry, one translated note sits above the body, mirroring Help. `make i18n-check` covers the chrome only.

### D4. The X row gives up the word "news"

The row label becomes "Follow on X". Its description stays a single sentence about posts on X, without the word news. Search keywords "x" and "twitter" stay; "news", "changelog" and "what's new" move to the card. The welcome note is unchanged.

### D5. Page length

The newest entry is expanded. Older ones are one line each inside a disclosure that starts closed, so the height audit sees About as it does today. The disclosure opening is the growing list, inside the settings page's existing scroll, not a new scroll region.

Data model impact: none. No dependency, no server code, no image or memory change. No environment variable.

Interface budget: no chrome on a task list, no new sidebar destination, no task property, no shortcut. The settings page already scrolls. The dot is one marker on a settings row.

## Risks / Trade-offs

- [A cached client is older than the server, so its entries lag the reported version] → The dot requires an entry for that version. No entry, no dot. The person sees the notes after the client updates, which is the same moment the new binary's assets arrive.
- [The copy inventory still describes the old X row] → This change's About requirement is the live contract. The inventory cell is a snapshot from `settings-copy`. The archive of this change updates that one cell; the task says so.
- [`whats-new` and `feedback-door` both edit the About requirement] → Each delta is against today's requirement plus its own sentence. Whichever is applied second re-reads the spec and keeps the other's sentence.

## Migration Plan

Add the build step to `make check` beside `templates-check`. No data migration. Rollback is removing the card and the check.

## Open Questions

None. An owner switch to hide news on a branded server was considered and left out; it can be its own change if a branded server asks.

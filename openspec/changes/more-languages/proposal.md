# Proposal

## Why

OpenTodo ships in six languages (English, German, French, Spanish, Italian, Portuguese), and quick add understands dates in the same six. The research (§4 P1.5, "Dutch vocabulary", old issue #3) names Dutch as the most requested missing language: the Netherlands and Flanders have a large self-hosting community, and the commercial apps they would leave are all available in Dutch. Today a Dutch speaker reads the app in English and has to type `tomorrow` instead of `morgen`.

Adding a language is also harder than it should be. `docs/translating.md` describes the steps, but a contributor has to copy keys by hand, find the five other places that hold translated text (the service worker's notification table, the browser extension, the Android shell, the server's email and channel messages) and guess how far along they are. There is no rule for a catalog that is almost done: it is either complete and offered, or invisible. A community that wants Polish or Swedish has no way to ship 95 % of a catalog and finish it in the open.

## What Changes

- **Dutch (`nl`) as a shipped language.** A complete, human-reviewed catalog for the web app, the service worker's notification texts, the browser extension, the Android shell, the server's emails (sign-in, invitations, the weekly digest) and the notification channel messages. Settings → Language and region → Language lists `Nederlands`.
- **Dutch quick-add vocabulary.** Dates, times, weekday and month names, relative days (`vandaag`, `morgen`, `overmorgen`, `vanavond`), `volgende week`, times (`om 15 uur`, `om half 4`), recurrence (`elke maandag`, `elke 3 dagen na voltooiing`), reminders (`herinner me 30 minuten van tevoren`), deadlines (`uiterlijk vrijdag`), someday and evening phrases. Bundled for the TypeScript parser and the Go twin (`internal/quickadd/vocab.json`), pinned by new rows in the shared vectors.
- **Contributor kit.**
  - `node scripts/i18n/new-language.mjs <code> "<Name>"` scaffolds every file a language needs (an empty catalog, the service worker table entry, the extension folder, the Android `values-<code>` folder, the server message tables, an empty quick-add vocabulary) and never touches a shipped language.
  - `make i18n-status` prints, per language and per surface, how many messages are translated and which are missing.
  - A **community language** tier: a catalog at least 90 % complete with a named maintainer can be offered in Settings, marked "Community translation", with missing text in English. The six maintained languages and Dutch stay complete in every release.
  - `docs/translating.md` gains "Adding a language, step by step", the community tier, the Dutch glossary column, and how to write a quick-add vocabulary with its vectors. A "Translation" issue template asks for a maintainer.
- **Not BREAKING.** No new environment variable, no op schema change: `user_prefs.language` already accepts any code and clients read an unknown one as `system`.

## Out of scope

- Right-to-left languages (Arabic, Hebrew): they need `dir` handling and a layout review; a later change.
- Translating the documentation and the in-app Help, which stay English (`localization` "Help stays English, and says so").
- Machine translation of any catalog, including community ones.
- Other new languages: the kit makes them possible; each lands as its own contribution.
- Dutch in the `ot` CLI's output (the CLI is English only) and in server error messages (translated on the client by code, as today).

## Roadmap

Advances ROADMAP-1.0 milestone 0.21 "Horizons and home", item `more-languages`, and the research's P1.5 "Dutch vocabulary". In ROADMAP.md it extends the localization row.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `localization`: Dutch joins the shipped languages; the community language tier; the scaffolding and status commands; server-written text follows the shipped list.
- `natural-language-capture`: the multi-language vocabulary adds Dutch.
- `notification-channels`: channel messages are written in every shipped language, Dutch included.

## Impact

- **Data model, sync, op schema:** none. `language: "nl"` is an existing field with a new value, read as `system` by older clients until they update.
- **E2EE:** none; no content fields.
- **API, CLI, MCP:** none. The server's message tables (`internal/mail`, `internal/channels`) gain `nl`. `internal/httpapi/quickadd.go` accepts `nl` as a vocabulary language because it reads `quickadd.Bundled`.
- **CalDAV and vault:** none. The vault's Obsidian Tasks grammar is emoji and English based and unchanged.
- **Bundle and binary size:** the Dutch web catalog is its own lazily loaded chunk (about 140 KB gzip, the size of the German one), never in the first load. The Dutch vocabulary adds about 1 KB gzip to the quick-add chunk and about 4 KB to the Go binary. The scaffold script is repository tooling and ships nowhere.

# Design

## Context

Translated text lives in seven places today, each with its own list of six languages:

| Surface | Where | Language list |
|---|---|---|
| Web app | `web/src/locales/<code>.json`, `SHIPPED` in `web/src/locales/index.ts` | `SHIPPED` |
| Service worker notifications | table in `web/public/push-sw.js` | the table's keys, pinned by a test |
| Browser extension | `extension/_locales/<code>/messages.json` | folders |
| Android shell | `mobile/android/app/src/main/res/values-<code>/strings.xml` | folders, `scripts/i18n/shell.mjs` checks them |
| Emails and digest | `internal/mail/templates/*.<code>.txt`, `mail.Languages` | `mail.Languages` |
| Channel messages | `internal/channels/messages.go` | its table |
| Quick-add vocabulary | `web/src/lib/nlp/vocab/<code>.ts`, `internal/quickadd/vocab.json`, `quickadd.Bundled` | `Bundled` |

`scripts/i18n-check.mjs` already treats a catalog that `SHIPPED` does not list as work in progress: it prints "pl: 412 of 3550" and never fails. `localization` says a language is offered only when complete and never machine-translated.

## Decisions

**D1. Dutch is a maintained language, complete in every release.** `nl` joins `SHIPPED`, `mail.Languages`, the channels table, the service worker table, the extension, the Android shell and `quickadd.Bundled`, in that order after `pt`. The catalog uses informal *je* (the register of Dutch consumer apps and of the other catalogs' *du*/*tu*), Netherlands spelling, and the glossary column in `docs/translating.md` (taak, subtaak, project, sectie, label, prioriteit, herinnering, deadline, Inbox, Vandaag, Binnenkort, Ooit). Alternative: ship Dutch as the first community language. Rejected: the research and the old issue ask for it explicitly, and a maintained language proves the kit end to end.

**D2. A human writes and reviews the Dutch catalog.** The spec forbids machine translation. The implementing pull request may start from a draft, but a named Dutch speaker reviews every entry before `nl` is added to `SHIPPED`; until then the catalog sits unlisted as work in progress, which the existing check already supports. This is the change's one external dependency (see the open question in the tasks).

**D3. Dutch quick-add vocabulary, same shape as the others.** `vocab/nl.ts` and the `nl` entry in `vocab.json`:

| Kind | Words |
|---|---|
| Day words | `vandaag` 0, `vanavond` 0 (evening), `morgen` 1, `overmorgen` 2 |
| Weekdays | `maandag`/`ma`, `dinsdag`/`di`, `woensdag`/`wo`, `donderdag`/`do`, `vrijdag`/`vr`, `zaterdag`/`za`, `zondag`/`zo` |
| Months | `januari`/`jan` … `december`/`dec`, day-month order (`3 maart`, `3-3`) |
| Relative | `volgende week`, `volgende maand`, `over 3 dagen`, `komende vrijdag` |
| Times | `om 15 uur`, `om 15:30`, `om half 4` (= 03:30, or 15:30 with `'s middags`), `'s ochtends`, `'s middags`, `'s avonds` |
| Recurrence | `elke dag`, `elke maandag`, `elke 2 weken`, `elke 3 dagen na voltooiing`, `werkdagen`, `elke eerste maandag` |
| Reminders | `herinner me 30 minuten van tevoren`, `herinner me om 9 uur` |
| Deadlines | `uiterlijk vrijdag`, `deadline vrijdag` |
| Someday / evening | `ooit`, `vanavond` |

`om half 4` follows Dutch usage: *half vier* is 3:30, never 4:30. Two-letter weekday abbreviations (`ma`, `di`, `do`, `zo`, `za`, `wo`, `vr`) match only as whole tokens preceded by `op` or followed by a day number or a time (`op ma`, `ma 3 mrt`, `ma om 9 uur`). The guard is new and lives in the Dutch vocabulary only (a `guardedAbbreviations` list both parsers read), so `Bel ma` ("call mum") stays a title. The full names match anywhere, like every other language. The stored rule stays canonical English (`every monday`). Shared rows in `web/src/lib/nlp/quickadd.vectors.json` pin the Go and TypeScript parsers to the same result: at least one row per table line above, plus `half` and the abbreviation guard. Alternative: skip abbreviations. Rejected: Dutch calendars write `ma 3 mrt`, people type them.

**D4. A community language tier with one threshold.** `SHIPPED` entries gain an optional `community: true`. The rules:

- A community catalog SHALL be at least 90 % complete (messages translated over source messages) and SHALL name a maintainer in `docs/translating.md`.
- Settings lists community languages after the maintained ones, with the caption "Community translation, some text in English" in that language's catalog (falling back to English).
- Missing messages fall back to English, as they already do message by message.
- `make i18n-check` fails when a community catalog drops below 90 %, so a release never ships one that degraded; it reports its missing messages without failing above the threshold.
- Surfaces outside the web app (emails, channel messages, the shell, the extension) may be missing for a community language and fall back to English; the status command shows them.
- Quick-add vocabulary is optional for a community language; without it English vocabulary is active, as today.

Alternative: no tier, everything complete. Rejected: a contributor community cannot reach 100 % of about 3,500 messages in one pull request, and today it has no way to ship progress. Alternative: any threshold the contributor likes. Rejected: a 50 % catalog reads as broken.

**D5. One scaffold script and one status report.** `scripts/i18n/new-language.mjs <code> "<Native name>"` refuses a code that is not two or three lowercase letters or already exists, then writes:

- `web/src/locales/<code>.json` as `{}` (unlisted, so work in progress);
- an empty entry in the service worker table, `extension/_locales/<code>/messages.json` with the English values marked `"TODO"` in the description, `values-<code>/strings.xml` with no strings;
- `internal/mail/templates/*.<code>.txt` copies flagged by a first line `# TODO translate` that the mail test refuses for a listed language;
- an empty vocabulary stub `web/src/lib/nlp/vocab/<code>.ts` and a commented block in `docs/translating.md`'s maintainer table.

It never edits `SHIPPED`, `mail.Languages` or `Bundled`; listing the language is the contributor's deliberate last step. `make i18n-status` (`node scripts/i18n/status.mjs`) prints a table of language × surface with translated / total and the first missing keys, read-only, outside `make check`. Both are standard-library Node, no dependency.

**D6. Server text follows one list per package, pinned by a test.** A Go test asserts that `mail.Languages`, the channels message table and `quickadd.Bundled` agree with `SHIPPED` (read from `index.ts`) for maintained languages, so a language cannot be shipped in the web app while its emails silently fall back. The existing push-sw and extension tests are extended the same way.

## Progressive disclosure and interface budget

Nothing new appears for anyone who does not choose Dutch. The Language panel gains one row (`Nederlands`) and, when a community language exists, a caption under it; no new screen, no chrome above any list, no new shortcut, no new sidebar destination.

## Risks

- **Ambiguous words with English.** `morgen`, `om`, `na` and the two-letter abbreviations are only parsed while Dutch is active (interface language, browser preference or device override), like every other vocabulary; vectors include an English title containing `door` and `over` with Dutch inactive to show nothing is parsed.
- **Review capacity.** A maintained language needs a reviewer for every later catalog change; the maintainer table names one, and the community tier is the fallback if Dutch loses its reviewer.

## Size

Dutch catalog ≈ 480 KB raw, ≈ 140 KB gzip, its own lazy chunk; vocabulary ≈ 2.5 KB raw in the quick-add chunk; Go binary grows by about 10 KB (templates and vocabulary). No dependency, no runtime memory change beyond the active catalog.

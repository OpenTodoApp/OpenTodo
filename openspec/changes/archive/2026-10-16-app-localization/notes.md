# Implementation notes

Deviations from the design and tasks, and what could not be run here.

## Deviations

- **Message count and catalog size.** The extraction finds 3,550 messages, not the ~1,500 estimated (the settings, server and assistant screens carry long explanatory text). Each catalog is 314–331 kB raw and 97–101 kB gzipped instead of 25–30 kB gzipped (design "Size"). Measured with `npm run build`:

  | Chunk | Raw | Gzip |
  | --- | --- | --- |
  | `index` (main), before (e8b25bb) | 1,001.07 kB | 296.70 kB |
  | `index` (main), after | 1,029.89 kB | 303.24 kB |
  | `de` | 323.55 kB | 100.85 kB |
  | `fr` | 331.12 kB | 100.71 kB |
  | `es` | 317.89 kB | 98.15 kB |
  | `it` | 316.69 kB | 97.41 kB |
  | `pt` | 314.18 kB | 97.20 kB |

  The main chunk grows by 28.8 kB raw (6.5 kB gzip): the message layer plus the source strings now wrapped in `t()`. The catalogs are separate chunks, loaded only when chosen, but the service worker precaches them so switching works offline (D3): the precache grows from 47 entries / 2,771 KiB to 53 entries / 4,403 KiB. A later change could shrink catalogs (index keys instead of English text) or precache only the active one with a runtime cache for the rest; both trade against offline switching, so they are left for a design decision.
- **Panel placement.** The Language panel is the first card of **Settings → General** (the section was renamed from "Preferences" before this change landed); its search entry and the General description name it. Settings cards carry no Help link (`settingsAnatomy`), so the planned `settings/language` help id is not used; the page header's Help covers it and the user guide is `docs/language.md`.
- **Server error messages in English.** With English active, the client keeps showing the server's own message (often more specific than the per-code text); other languages show the translation per code, with the server's English detail for generic codes (`invalid_input`, `bad_request`, …).
- **Data in canonical English syntax.** Recurrence rules and filter queries keep their English keywords in every language (they are stored and shared as text), and their parse errors quote those keywords. The `UNDECRYPTABLE` marker stays data; its display text is translated.
- **Model-facing assistant text** (system prompts, tool descriptions) stays English and is allow-listed; only what people read is translated.
- **Activity verbs.** "{actor} {action}" lines use a past-tense verb phrase per language (German Präteritum, French passé composé) so joined clauses read naturally; version summaries in the history ("Renamed and rescheduled") use participles through the `|version` context.
- **Ops invariants.** Internal invariant errors in `lib/ops.ts` (programming errors such as "Task not found") are not translated.
- **Script tests** run with `node --test` (`make i18n-check`) rather than vitest, like the other scripts in `scripts/`.
- **Catalog check exemption.** "Settings → …" paths in an operating system's own settings ("On Android, check Settings → Apps …") are exempt from the section-name rule: they use the system's wording.
- **Docs.** The language setting got its own guide page (`docs/language.md`) because `settings-app.md` and `settings.md` hit the 600-word limit; it reuses the existing Settings screenshot until `make docs-screenshots` is run.

## Not run here

- **Native-speaker review (6.1).** Substituted by a careful self-review against the glossary in `docs/translating.md`, the quick-add vocabularies and the mail templates; each catalog still needs a speaker's review before release.
- **Layout check in German (11.1).** `scripts/e2e-layout.mjs` accepts `OPENTODO_LANG` and writes the synced preference before capturing, but Playwright browsers and a server could not be run in this environment. Some overlay openers in the script are found by English accessible names; a German run may need those selectors made language-independent.
- **Manual smoke (11.2)** on `make dev` with two browser profiles and an installed build: not possible here. Covered instead by the component test that switches the language locally and by sync (`languageSettings.test.tsx`), the offline catalog load test (`lib/i18n/i18n.test.ts`) and the service worker tests (`pushWorker.test.ts`).
- **Storybook build (10.1).** The `locale` global is in `.storybook/preview.tsx`; `npm run build-storybook` and the a11y pass were not run.

## Stories needing visual baselines

- `settings-app--language` (Settings/App → Language)
- `settings-app--language-unavailable` (Settings/App → Language, catalog failed to load)

Existing baselines are unchanged: stories render in English by default.

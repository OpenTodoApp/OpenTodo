## Why

Japanese is a common browser language, and today it falls back to English ([issue #884](https://github.com/OpenTodoApp/OpenTodo/issues/884)). The maintainer decided that the project drafts the Japanese catalog itself (an AI-assisted draft) and that a native speaker reviews it afterwards, as was done for Simplified Chinese and Russian. The text layout a language without spaces needs (strict line breaking, ellipsis on titles without spaces, no webfont, the input-method guard) shipped with Simplified Chinese ([#883](https://github.com/OpenTodoApp/OpenTodo/issues/883)) and is reused here.

## What Changes

- **Japanese (`ja`, shown as 日本語) as a community language.** A complete web catalog (every message, `other` as the only plural category), listed after the maintained languages with the community caption. A browser that prefers `ja` or `ja-JP` gets it when the account has not chosen a language. The root `lang` is `ja`; `dir` stays left to right. Dates and numbers come from `Intl` with the resolved locale (2026年11月4日, 2026/11/04, 1,234).
- **A machine draft, reviewed by a native speaker.** The translation guide lists Japanese as a machine draft looking for a reviewer, with a Japanese column in the glossary.
- **Small surfaces that cost nothing to carry:** the service worker's notification texts, the browser-too-old notice, and the weekday and date order of note-template placeholders (`{{weekday}}` 月曜日, `{{date}}` year first), in the TypeScript and Go twins and their shared vectors.
- **Composition guard in the plain comment composer.** Enter while an input method is composing no longer picks a mention or sends the comment. Quick add and the task title already had the guard; the rich composer leaves composing keys to its editor.
- **Not BREAKING.** No new environment variable, no op schema change; `user_prefs.language` already accepts any code and an older client reads `ja` as `system`.

## Out of scope

- Promoting Japanese to a maintained language. Emails, the weekly digest, notification-channel messages, the browser extension, the Android and iOS shells stay English for Japanese, as the community tier allows, until the review is done and those surfaces are translated.
- A Japanese quick-add vocabulary (明日, 来週の月曜, 午後3時). The parser splits on spaces, as for Chinese; English dates keep working.
- Vertical text, era dates (令和) and right-to-left layout. Help and the documentation stay English.

## Roadmap

Advances ROADMAP milestone 0.21 "Horizons and home", beside `simplified-chinese` and `more-languages`. Tracked as issue #884.

## Capabilities

### Modified Capabilities

- `localization`: Japanese joins the shipped languages as a community language whose catalog the maintainers drafted and a native speaker reviews; a Japanese browser no longer falls back to English.
- `natural-language-capture`: the composition guard also covers the plain comment composer.

## Impact

- `web/src/locales/ja.json` (a lazily loaded chunk, never in the first load), `web/src/locales/index.ts`, `web/public/push-sw.js`, `web/public/browser-check.js`, `web/src/lib/noteTemplateFill.ts`, `internal/templatelib/placeholders.go` and its vectors, `web/src/app/task-detail/Composer.tsx`, tests, `docs/translating.md`, `docs/language.md`, `docs/contributing/add-a-language.md`, a changelog fragment.
- No new dependency and no font file. Data model, sync, E2EE and API: none.

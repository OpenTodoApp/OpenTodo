## Why

A reader in China asked for Chinese ([discussion #882](https://github.com/OpenTodoApp/OpenTodo/discussions/882), [issue #883](https://github.com/OpenTodoApp/OpenTodo/issues/883)). A browser that prefers Simplified Chinese is shown English, because only English, German, French, Spanish, Italian and Portuguese are shipped. A catalog on the current text layout is not enough: notes can break before Chinese punctuation, and Enter confirms a character in a Chinese input method and can also create the task.

## What Changes

- **Simplified Chinese (`zh`), shown as 简体中文.** A complete, human-reviewed catalog on the surfaces a shipped language already has: the web app, the service worker's notification texts, the browser extension, the Android shell, server emails (including the weekly digest) and notification-channel messages. Settings → Language and region → Language lists 简体中文. A browser that prefers `zh`, `zh-Hans`, `zh-CN` or `zh-SG` gets it when the account has not chosen a language. `zh-Hant`, `zh-TW`, `zh-HK` and `zh-MO` stay on English.
- **Text layout for a language without spaces.** Characters the bundled typeface does not cover come from the system font stack. No Chinese font is downloaded. Notes and multiline titles break by the document language's rules, including not before punctuation that the language keeps with the previous character. A truncated title with no spaces still ends in an ellipsis and still carries its full text.
- **Enter during composition does not commit.** In quick add and in a task title being edited, Enter while an input method is composing confirms the character and does not create the task or save the title. The same key after composition has ended commits as it does today. This holds in every language.
- **Not BREAKING.** No new environment variable, no op schema change. `user_prefs.language` already accepts any code; a client that does not ship `zh` reads it as `system` and leaves the stored value unchanged.

## Out of scope

- Traditional Chinese. The resolver leaves `zh-Hant`, `zh-TW`, `zh-HK` and `zh-MO` on English so a later catalog does not have to migrate people off Simplified.
- Japanese ([issue #884](https://github.com/OpenTodoApp/OpenTodo/issues/884)) and Arabic ([issue #885](https://github.com/OpenTodoApp/OpenTodo/issues/885)). The composition guard and the line-breaking rule land here and are reused; each language's catalog is its own change. `dir` stays left to right (`localization`).
- Quick-add vocabulary. The parser matches whole words split on spaces, and a Chinese date is written inside the title (`明天下午3点开会`). A matcher that only reads a date at the start or the end of the line is a later change. Until then, quick add keeps the vocabularies it has today, English when the browser prefers only Chinese.
- Translating the documentation and the in-app Help, which stay English.
- Waiting for the review before the language is offered. peilf reviews the wording afterwards.
- Dutch and the contributor kit (`more-languages`). This change does not wait for that one. Both edit the shipped-language list; the merged list is the union.
- The `ot` CLI's output, and server error messages (translated on the client by code, as today).

## Roadmap

Advances ROADMAP milestone 0.21 "Horizons and home", beside `more-languages`, and the localization row (the app in your language). Tracked as issue #883.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `localization`: Simplified Chinese joins the shipped languages; a Chinese browser tag resolves by script and region; the catalog is offered only when a person has reviewed it.
- `design-system`: glyphs outside the bundled typeface use the system font stack, and line breaking follows the document language.
- `natural-language-capture`: Enter during input-method composition does not commit quick add or a title edit.
- `outgoing-email`: `zh` joins the languages a message can be written in.
- `email-digest`: the digest accepts `zh` and its golden file covers that language.
- `notification-channels`: a channel saved from the app in Simplified Chinese sends Chinese messages.

## Impact

- **Data model, sync, op schema:** none. `language: "zh"` is an existing field. The digest's `language` is server data, not an op, and gains an accepted value.
- **E2EE:** none. No content field. Digests and channel messages keep today's rule that encrypted accounts do not receive task content.
- **API:** `PUT /api/v1/me/email-digest` accepts `language: "zh"`. No new route.
- **Bundle and binary:** the web catalog is its own lazily loaded chunk, not part of the first load. No new font file and no new dependency. Email templates and channel strings add a few kilobytes to the server binary.

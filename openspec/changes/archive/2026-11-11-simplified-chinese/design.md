## Context

Six languages are shipped. The code of each is a primary subtag (`de`, `fr`), and a browser tag matches on that subtag alone (`de-CH` → `de`). `user_prefs.language` already stores any code; a client that does not know the code treats it as `system` and leaves the stored value alone. Catalogs are one lazy chunk per language. Dates and numbers go through `Intl` with the resolved locale.

The bundled typeface is OpenTodo Inter, and its `@font-face` `unicode-range` stops at Latin. A Chinese glyph already falls through to `system-ui`. Global shortcuts already ignore a key while an input method is composing. The task title commits on Enter by blurring, and quick add submits its form on Enter, neither of which checks composition.

Quick add splits the line on spaces and matches whole tokens. `明天下午3点开会` is one token.

`more-languages` (Dutch, and a community-language kit) is a separate change. It also edits the shipped-language list. This change does not depend on it.

## Goals / Non-Goals

**Goals:**

- A Chinese browser (`zh`, `zh-Hans`, `zh-CN`, `zh-SG`) gets Simplified Chinese when the account has not chosen a language, and Settings lists it as 简体中文.
- Traditional Chinese tags stay on English.
- Notes and multiline titles do not break before punctuation the language keeps with the previous character. Enter during composition does not commit quick add or a title, in any language.
- The catalog is human-reviewed, complete on every surface a shipped language already has, and is not part of the first load. No new font.

**Non-Goals:**

- Traditional Chinese, Japanese, Arabic, and right-to-left layout.
- A Chinese quick-add vocabulary, or any matcher for dates written without spaces.
- Translating Help or the documentation. Machine translation.
- Dutch, the contributor kit, the CLI's output, server error strings.

## Decisions

**D1. The shipped code is `zh`, the name in the list is 简体中文.** `SHIPPED` in `web/src/locales/index.ts` is a list of primary subtags, and `resolveLanguage` matches the primary subtag of a browser tag. A code of `zh-Hans` would not match `zh-CN`, so the browser in discussion #882 would stay on English. Alternative: ship `zh-Hans` and teach every caller a special case. Rejected: the stored value, the catalog filename, the Android `values-zh` qualifier and `mail.Languages` all want one short code, and `zh` is that code.

**D2. Chinese is resolved by script and region.** Before the primary-subtag loop, a `zh` tag is classified:

| Tag | Result |
|---|---|
| `zh`, `zh-Hans`, `zh-CN`, `zh-SG` (script `Hans` with any region) | `zh`, when `zh` is shipped |
| `zh-Hant`, `zh-TW`, `zh-HK`, `zh-MO` (script `Hant` with any region) | not `zh` |
| any other `zh` tag (`zh-MY`) | not `zh` |

The browser list is walked in order, so `zh-TW, zh-CN` resolves to `zh` and `zh-TW` alone stays English. A stored preference `zh` is Simplified Chinese on every device. The Intl locale is the browser tag when that tag itself resolves to `zh` (`zh-CN` stays `zh-CN`), otherwise `zh`. Dates and numbers then follow the existing formatters; there is no Chinese date code. Alternative: map every `zh` to Simplified. Rejected: a Traditional Chinese catalog would then have to migrate people who were given the wrong script.

**D3. The catalog is listed, and peilf reviews the wording afterwards.** `zh.json` is complete, with placeholders, tags and plural structure preserved and Chinese plurals using only `other`. It is listed in `SHIPPED` so a Simplified Chinese browser gets it. peilf, who asked in discussion #882, reviews the wording later; that review is not a gate on listing. Alternative: leave it unlisted until the review. Rejected: the language would stay invisible, which is the problem this change exists to close.

**D4. No font file.** Do not add a Chinese webfont, and do not widen Inter's `unicode-range`. Glyphs outside that range keep falling through to the system stack. The catalog is one lazy chunk, the same pattern as the other languages, and is not in the first load.

**D5. Strict line breaking on the document, in every language.** Set `line-break: strict` on the root. For Chinese it keeps `。` and `，` with the preceding character. For the languages shipped today it does not change ordinary wrapping. Leave `.user-text` on `overflow-wrap: anywhere` so a long URL still breaks; Chinese prose already has a break between characters, so `anywhere` is not what wraps a note. Alternative: switch `anywhere` to `break-word`. Rejected: that is a wider change, and URLs in notes still need a break that is not a word boundary. The type scale is unchanged. Chinese labels are shorter than the German ones the layout audit already runs.

**D6. One composition check, on the two fields that commit on Enter.** `TitleField` blurs on Enter, and that blur commits the title. Quick add's form submits on Enter. Both treat the key as composition when `isComposing` is set or the key code is 229 (the code some browsers send for a composing Enter instead of setting `isComposing`). The key is then ignored. The assistant composer already checks `isComposing`; this is the same rule on the two fields that were missing it. It applies in every language, so a Japanese input method is covered before a Japanese catalog exists. Global shortcuts already return early while composing and stay as they are.

**D7. Surfaces, and quick add left alone.**

| Surface | Where `zh` is added |
|---|---|
| Web catalog | `web/src/locales/zh.json`, then `SHIPPED` |
| Service worker | the `TEXT` table in `web/public/push-sw.js` |
| Browser extension | `extension/_locales/zh/messages.json` |
| Android shell | `mobile/android/.../res/values-zh/strings.xml` |
| Emails and digest | `internal/mail/templates/*.zh.txt`, `mail.Languages`, the digest golden file |
| Channel messages | the table in `internal/channels/messages.go` |

`web/src/lib/nlp/vocab` is not given a `zh` entry. `activeLanguages` drops a code with no vocabulary, so with only Chinese in the browser list quick add uses English. That is the behavior until the follow-up.

**D8. Plurals use `other` only.** `Intl.PluralRules('zh')` has the single category `other`. A Chinese entry that also contains `one` fails `make i18n-check`. Translators write one branch.

## Interface budget

Nothing new above a list. The Language panel gains one row, 简体中文. No new screen, no new shortcut, no new sidebar destination, no new default task property.

## Size

No new dependency and no font file. The catalog is a lazy chunk of about the size of one existing language chunk (the German one is about 140 KB gzip) and is outside the first load. Email templates and channel strings add a few kilobytes to the server binary. Runtime memory is the one active catalog, as today.

## Risks / Trade-offs

- [A later Traditional Chinese catalog] → D2 keeps those tags on English, so nobody has to be migrated off `zh`.
- [A machine draft misnames a product term] → D3: peilf reviews the wording after it is listed. Placeholders and plural categories are checked by `make i18n-check`, so a bad draft can be wrong in words and still safe in structure.
- [Safari reports a composing Enter as key code 229 with `isComposing` false] → D6 checks both.
- [People expect 明天 to set a date] → quick add stays on today's vocabularies, and the follow-up is a suffix and prefix matcher, not a word list. The language panel does not promise Chinese dates.
- [`more-languages` edits the same shipped-language requirements] → this delta is against the live six-language spec. Whichever change archives second keeps both languages.
- [Negative letter-spacing on headings looks tight in Chinese] → out of this change. A reviewer who sees clipped headings sends it back; the type scale is not edited in advance.

## Migration Plan

No migration and no new environment variable. A device on an older release that receives `language: "zh"` shows its usual language and keeps the stored value, so the newer device stays in Chinese. Removing `zh` from a release has the same effect.

## Open Questions

- None. peilf reviews the wording after it is listed.

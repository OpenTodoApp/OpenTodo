## Context

Eleven languages are shipped; Russian is the one community language. `resolveLanguage` matches a browser tag on its primary subtag, so `ja` and `ja-JP` need no special case (only Chinese is classified by script). The Simplified Chinese change put `line-break: strict` on the root, left glyphs outside Inter to the system font stack, and added `composingEnter` to quick add and the task title.

## Decisions

**D1. Community, not maintained.** The catalog is complete, but a maintained language must also be complete on emails, the digest, channel messages, the extension and the native shells, and a native speaker has not read any of it. A community listing ships the web app now and keeps the other surfaces honest (English) until the review. Promotion is dropping `community: true` and adding those surfaces, as the guide already describes.

**D2. Register and terms.** です/ます in sentences; plain nouns and verbs on buttons and menu items (保存, 完了, 削除). Product terms follow the glossary column (タスク, プロジェクト, インボックス, 今日, 近日予定, いつか, 予定日 for the due date, 締め切り for the deadline). A task's notes field is メモ; a note as its own item is ノート. Placeholders keep spaces around them where they hold Latin text or names. Every plural uses `other` only; the translation check rejects `one` for `ja`.

**D3. Text layout is reused.** No change to the type scale, fonts or `line-break`. Japanese breaks between characters, `line-break: strict` keeps closing brackets and punctuation off the start of a line, and truncated titles keep their ellipsis and full-text tooltip as they do for Chinese.

**D4. Small surfaces.** The service worker's twelve texts are copied from the catalog (the push worker test pins them). The browser-too-old notice has its own four sentences. Note-template placeholders get Japanese weekday names and the year-first date order, in both twins, with shared vectors.

**D5. The comment composer's plain textarea** returns early on `composingEnter`, so a composing Enter neither picks a mention nor sends. The rich composer is a ProseMirror view, which already ignores keys while composing.

## Interface budget

One more row in the Language panel's select. No new screen, shortcut, sidebar destination or task property.

## Size

The catalog is one lazy chunk of about the size of the Chinese one; the first load is unchanged (`make bundle-budget`). No dependency, no font, no server change beyond two weekday rows in `templatelib`.

## Risks / Trade-offs

- [A draft misnames a term or reads stiffly] → the guide asks for a native reviewer, and the check keeps placeholders, tags and plurals safe.
- [People expect 明日 to set a date] → Help and the language page say quick add reads English dates; a Japanese vocabulary is its own change.
- [Long labels in a phone bar slot] → Japanese labels are shorter than German ones, which the layout audit already covers.

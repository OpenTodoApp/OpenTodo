# Tasks

## 1. Web app

- [x] 1.1 `formattingAt` and `onViewUpdate` in `web/src/lib/richtextEditor.ts`, the view-updates plugin in `plugins()`; `aria-pressed` on the row's five controls in `web/src/app/EditorChrome.tsx`; the pressed look in `web/src/index.css`. Verify: `npx vitest run src/lib/richtextEditor.test.ts src/app/task-detail/notesFormatting.test.tsx` (the row test fails without the change), `npx tsc -b --noEmit`.

## 2. Checks

- [ ] 2.1 On a phone: tap into bold text in a task's notes, then into a checklist: Bold, then Checklist, show as pressed; with VoiceOver or TalkBack Bold is read as on.

## 3. Docs and release

- [x] 3.1 `docs/formatting-row.md`. Verify: `make docs`, `make docs-check`.
- [x] 3.2 Changelog fragment `changelog.d/Added/formatting-row-pressed.md`.

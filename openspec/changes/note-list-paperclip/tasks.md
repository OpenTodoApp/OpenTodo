# Tasks

## 1. Web app

- [x] 1.1 `noteAttachmentCounts` in `web/src/lib/attachments.ts` and `useNoteAttachmentCount` in `web/src/app/useCommentCounts.ts` (one shared live query); `NoteRow` shows the paperclip and the count for a standalone note's files and a task's files. Verify: `npx vitest run src/app/notes/noteRowAttachments.test.tsx` (two live files and one removed show 2, named "2 attachments"; a task with one file shows 1; a note without files shows none; a file added later shows 3), `npx vitest run src/app/notes src/lib/attachments`, `npx tsc -b --noEmit`, `npx eslint` on the changed files.

## 2. Checks

- [x] 2.1 Built app, Chromium at 390 × 844 with touch and at 1280 with a mouse: the paperclip and "2" sit after the title of the note with two files, named "2 attachments", none on the note without files, and the time column is at the same x on both rows.
- [ ] 2.2 On a phone: the same in the Notes list.

## 3. Docs and release

- [x] 3.1 `docs/notes.md`. Verify: `make docs`, `make docs-check`.
- [x] 3.2 Changelog fragment `changelog.d/Changed/note-list-paperclip.md`. Verify: `node --test scripts/repo-checks.test.mjs`.

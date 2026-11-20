# Tasks

## 1. Web app

- [x] 1.1 `wrapInBulletList` in `web/src/lib/richtextEditor.ts`, used by the Bullet list command (`web/src/app/editorCommands.ts`) and `Mod-Shift-8`: in a checklist it sets every item's `checked` to null; elsewhere `wrapInList(bullet_list)`. Verify: `npx vitest run src/lib/richtextEditor.test.ts` (a two-item checklist with one checked item becomes `- buy milk` / `- bread` from the caret in one item; a paragraph becomes `- eggs`; the new test fails with the old command), `npx vitest run src/app/task-detail src/app/editor src/lib/richtext`, `npx tsc -b --noEmit`, `npx eslint` on the changed files.

## 2. Checks

- [x] 2.1 Built app, Chromium at 390 × 844 with touch: a checklist in a task's notes, the formatting row's Bullet list with the caret in it: the boxes go, the lines stay.
- [ ] 2.2 On a phone: the same from the formatting row.

## 3. Docs and release

- [x] 3.1 `docs/formatting-row.md`. Verify: `make docs`, `make docs-check`.
- [x] 3.2 Changelog fragment `changelog.d/Fixed/checklist-to-bullets.md`. Verify: `node --test scripts/repo-checks.test.mjs`.

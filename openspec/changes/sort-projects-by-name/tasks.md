## 1. Sort by name

- [x] 1.1 `planSortByName`: natural, case-insensitive order; a project the user may not move keeps its place; equal positions renumbered; nothing written when sorted (vitest `src/lib/projectSort.test.ts`)
- [x] 1.2 `sortProjectsUndoable`: sub-projects only, one batch of `position` ops, one Undo that restores the order; the top level with a shared project left in place (vitest `src/lib/projectSort.test.ts`)
- [x] 1.3 "Sort sub-projects by name" in the project menu from two sub-projects, for the owner and admins (vitest `src/app/projectMenu.dom.test.tsx`)
- [x] 1.4 "Sort by name" in the sidebar's Projects header menu; a project created afterwards goes last (vitest `src/app/sidebar.test.tsx`)

## 2. Moves

- [x] 2.1 A project move counts only the current workspace's projects (vitest `src/lib/projectSort.test.ts`)
- [x] 2.2 All projects page: Alt+Down twice moves the row twice and keeps focus; nothing moves while a header sorts (vitest `src/app/projectsView.test.tsx`)

## 3. Check

- [ ] 3.1 `npm test` and `npm run build` in web/, `make i18n-check`, `make openspec-validate`

# Tasks

## 1. Make a rule from a section

- [x] 1.1 `ruleDraftFromSection` and "Make an automation rule" in `sectionMenuGroups` / `SectionHeader` (design D1). Verify `npx vitest run src/app/sectionMenu.test.tsx` (the draft handed to the editor, absent when off, absent for a viewer)
- [x] 1.2 `lib/rules/automationsOn.ts`: read `automations.enabled` from `/me` at sync start and after the owner's switch changes, remembered on the device; hide the saved view and board column items too (design D2). Verify `npx vitest run src/lib/rules/automationsOn.test.ts src/app/viewMenuSites.test.tsx`

## 2. Sub-projects from a project

- [x] 2.1 `newSubProject` signal; the Shell brings the sidebar on screen and the Sidebar opens its form with the parent; "New sub-project…" in `projectMenuGroups` for the owner and admins and in the palette (design D3). Verify `npx vitest run src/app/sidebar.test.tsx src/app/projectMenu.dom.test.tsx`
- [x] 2.2 Sub-projects group in Board layout above the columns (design D4). Verify `npx vitest run src/app/subProjects.test.tsx` and screenshots at 360, 768 and 1280 px

## 3. Ship

- [x] 3.1 Six catalogues (`make i18n-check`), docs (`docs/sections-and-boards.md`, `docs/projects.md`, `docs/automations.md`; `make docs-check`), CHANGELOG entry. Verify `npm test`, `npm run build`, `make openspec-validate`

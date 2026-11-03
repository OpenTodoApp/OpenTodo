## 1. Rows

- [x] 1.1 `rowOrigin` and the icon-only chip for imported origins (`web/src/lib/taskOrigin.ts`, `web/src/app/OriginChip.tsx`, `web/src/app/TaskRow.tsx`); verified by `web/src/app/taskRow.test.tsx` "a narrow row keeps its title (issue 844)"
- [x] 1.2 Under 30 rem the origin is its icon, on a phone it is left to the details, and the Inbox's source line is the second line (`web/src/index.css`); verified by the same tests and by the story `Screens/Task row` ImportedOrigins at 375 and 390 px (titles 148 to 232 px wide, 1 to 64 px before)

## 2. Checks and docs

- [x] 2.1 `npm test`, `npm run typecheck` and `npm run build` in web/, `make web-lint`, `make ui-lint`, `node scripts/bundle-budget.mjs`
- [x] 2.2 CHANGELOG, `npx --yes @fission-ai/openspec@1.13.2 validate --all --strict`

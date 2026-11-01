# Tasks

## 1. Panel title

- [x] 1.1 Reset a multiline panel title's internal scroll on blur in `web/src/app/TitleField.tsx`; verified by the scroll-position case in `web/src/app/titleField.test.tsx`

## 2. Phone chrome

- [x] 2.1 Hide the floating add button while Settings is the current view in `web/src/app/Shell.tsx`, keeping the tab bar; verified by `web/src/app/tabBar.test.tsx`

## 3. Install appearance

- [x] 3.1 Set the static light and dark `theme-color` metas and `mobile-web-app-capable` in `web/index.html`, the light fallback in `web/public/appearance.js`, and `theme_color` in `web/vite.config.ts` from the default appearance; verified by `web/src/lib/appearance.test.ts`
- [x] 3.2 Set the manifest splash `background_color` to the light canvas `#eef0f2` in `web/vite.config.ts`; verified by `web/src/lib/appearance.test.ts`

## 4. Checks

- [x] 4.1 `npx --yes @fission-ai/openspec@1.13.2 validate --all --strict`
- [x] 4.2 `cd web && npm run typecheck && npm run lint && npx vitest run --maxWorkers=4`
- [x] 4.3 `node --test scripts/i18n/extract.test.mjs scripts/i18n/untranslated.test.mjs scripts/i18n-check.test.mjs scripts/i18n/shell.test.mjs scripts/i18n/obsidian.test.mjs && node scripts/i18n-check.mjs`

## 1. Tint

- [x] 1.1 `ListGroupHeader` takes a `hue` and fills with `.ui-group-tint` (bar or board strip); `SectionHeader` passes the section's hue; "Show" uses the default tone on a tint (`web/src/app/sectionMenu.test.tsx`)
- [x] 1.2 `.ui-group-tint` in `web/src/index.css`, the derived step `hue-<name>-tint` and its text, muted and faint pairs in `web/src/ui/tokens/pairs.ts`, the stylesheet-matches-derived test (`web/src/ui/tokens/contrast.test.ts`)
- [x] 1.3 The theme editor's `checkTheme` mixes the tint; `reference.json` regenerated with `node scripts/themes-sync.mjs` (`web/src/lib/theme/` tests agree on every theme)

## 2. Checks and docs

- [x] 2.1 Changelog fragment, `npm run typecheck`, `npm run lint`, the touched web tests, `make bundle-budget`, `make openspec-validate`, `make repo-check`, `make docs-check`
- [x] 2.2 Visual baselines of the stories with coloured sections regenerated with `make ui-baselines`, only the changed ones committed

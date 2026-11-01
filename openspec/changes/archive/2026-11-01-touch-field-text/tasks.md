## 1. Fields

- [x] 1.1 The small type steps read `--ot-text-*` variables and a base-layer rule raises them to 16 px on fields on touch screens (`web/src/index.css`); verified by the layout check (`make layout-check`) with no "text field" failures, `npm test` and `npm run build` in web/
- [x] 1.2 Keyboard close puts a scrolled document back (`web/src/ui/overlay/stack.ts`); verified by `web/src/ui/overlay/visualViewport.test.ts`

## 2. Check

- [x] 2.1 `smallFields` in `scripts/ux-audit/measure.mjs`, run on every screen and overlay by `scripts/e2e-layout.mjs`; verified by `node --test scripts/ux-audit/measure.test.mjs` and by the layout check failing on the unfixed build (172 fields)

## 3. Docs

- [x] 3.1 `docs/install-phone.md`, `docs/design-system.md`, CHANGELOG; verified by `make docs-check`

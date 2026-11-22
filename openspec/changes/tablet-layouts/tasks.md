## 1. Audit

- [x] 1.1 Every screen at 744, 820, 1024, 1180, 1366 px portrait and landscape, and 320, 507, 678, 981 px; findings recorded in design.md (D1)
- [x] 1.2 Update D2 from the findings before any code

## 2. Layout

- [ ] 2.1 Measured pane rules (`ResizeObserver` on the frame); vitest for the thresholds
- [ ] 2.2 Compact sidebar from 600 px; three panes from 900 px; Notes and Calendar follow
- [ ] 2.3 Open task and scroll position survive a resize; layout check test

## 3. Check

- [ ] 3.1 `scripts/e2e-layout.mjs` gains 744, 1024 and 1180 px with landscape heights; `make layout-check`
- [ ] 3.2 `npm test`, `npm run build`, `make bundle-budget` in web/
- [ ] 3.3 Device check rows on an iPad (portrait, landscape, split view, Stage Manager) and an Android tablet or foldable

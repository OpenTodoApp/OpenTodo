# Tasks

## 1. Web app

- [x] 1.1 `PeriodChooser` below 768 px (`DESKTOP_HEADER_QUERY`): one ghost menu button with the period's name and a chevron that opens the five periods as radio items; the radio group from 768 px; the header row takes the page's width below 768 px so the "…" ends it. Verify: `npx vitest run src/app/review/statsView.test.tsx` (the row's two controls and their names, the first focusable control, the checked item, ArrowDown, a choice updating the tiles and the stored period; the radio group without a phone).
- [x] 1.2 The public page's heading: `TruncatedText as="h1" wrap="phone"`, the dot on the first line below 768 px. Verify: `npx vitest run src/app/publicList.test.tsx` (the heading's text and `title-phone`, axe).
- [x] 1.3 `ViewsCrumb`: the name through `TruncatedText`, one line. Verify: the saved view and Filter view tests in `src/app`, and 2.3.
- [x] 1.4 Type-check and lint. Verify: `npx tsc --noEmit`, `npx eslint` on the changed files, `node scripts/i18n-check.mjs` (no new string).

## 2. Checks in a browser

- [x] 2.1 Built app, the layout check's seed, Chromium with touch at 360 and 390 px: on Statistics the tiles start at y = 109 (219 before; 267 before in German and Italian at 360 px); the period button and the "…" share one row, each 44 px tall, nothing scrolling sideways. Verify: before and after measurements and screenshots.
- [x] 2.2 At 360 and 390 px in English, and at 360 px in German and Italian: every period by tap (the button's name, the checked item and the stored period after each), and by focus, Enter, ArrowDown, Enter; Escape returns focus to the button. Verify: the same run.
- [x] 2.3 The public page at 360 and 390 px: the seeded name on two lines, not cut; a name longer than two lines cut on the second with the full text as its tooltip label; the notice directly under the heading. The saved view at 360 px: the name on one line in the bar, cut, with the full name as its tooltip label. Verify: the same run.
- [x] 2.4 At 768 and 1280 px the Statistics header's controls, the public page's heading and dot, and the view's name have the same place and size as before. Verify: the two measurements compared.
- [x] 2.5 The interface tour for the three screens. Verify: `ONLY=stats,public,view WIDTHS=360 THEMES=light LANGS=en,de node scripts/ux-audit/tour.mjs` reports no finding (M10 before on `public` and `view`).
- [ ] 2.6 On a phone, in the Android and the iOS app: Statistics' period sheet, and a public link with a long name in the phone's browser.

## 3. Docs and release

- [x] 3.1 `docs/statistics.md`, `docs/public-links.md` and `docs/interface-guide.md`. Verify: `make docs`, `make docs-check`.
- [x] 3.2 Changelog fragment `changelog.d/Changed/phone-stats-period.md`. Verify: `node --test scripts/repo-checks.test.mjs`.
- [x] 3.3 Re-baseline the phone-width UI screenshots of Statistics and of the public list. Done: green on main, CI run 44897180907 at 6e62dbd69 (21 Nov), which runs this check.
- [x] 3.4 Add the change to `ROADMAP.md` under "Shells that feel native" and regenerate `docs/roadmap.md`. Done: the row is in ROADMAP.md.

---

Shipped in 1.5.0; device check moved to the owner's list (the board task "Owner: device checks from shipped changes").

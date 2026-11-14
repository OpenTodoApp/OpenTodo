# Tasks

## 1. The rule

- [x] 1.1 `.title-phone` and `.title-phone-row` in `web/src/index.css`; `TruncatedText` takes `wrap="phone"`. Verify: `npx vitest run src/app/fullTitles.test.tsx src/ui/tooltip.test.tsx` (the phone block has the two-line clamp, the full-titles rule and the row's baseline and padding; the wrapped text carries the class, not `truncate`).

## 2. The lists

- [x] 2.1 Notes: the title on up to two lines, the time and the place under it below 768 px, the snippet on its own line while searching, the icon and the menu on the first line (`NoteRow.tsx`). Verify: `npx vitest run src/app/notes`; at 360 px a short-titled row is 50 px, a two-line row 70 px, the open control and the menu are at least 44 px, the menu is at the row's top on both.
- [x] 2.2 Calendar: the Month's day list (`MonthRow` `list`, `MonthView.tsx`), the Week agenda's rows, occurrences and block checklist (`WeekAgenda.tsx`, `projections.tsx`), the Plan agenda's rows (`TaskRow.tsx` compact `large`, `PlanRow.tsx`). Verify: `npx vitest run src/app/calendar`; at 360 px one-line rows are 44 px, long titles take two lines, and the time, estimate and priority have their centre within the title's first line.
- [x] 2.3 Close the day: the three steps' lists, the project's name capped at a third of the line (`CloseDay.tsx`, `CarryOver.tsx`). Verify: `npx vitest run src/app/review`; at 360 px a done task with a long project name shows its title on two lines.
- [x] 2.4 Command bar: a result's name with the palette look, unless the list is windowed (`Combobox.tsx`). Verify: `npx vitest run src/ui/Combobox src/app/palette`; at 360 px a long result is two lines over its one-line second line, a short one is 44 px.

## 3. In a browser

- [x] 3.1 Built app, the layout check's seeded account plus tasks with long titles, Chromium, touch, 360 px: Notes (also searching, and with standalone notes), Month, Week, Plan, the three steps of Close the day, the command bar, before and after. Verify: every `.title-phone` is at most two lines and none is cut with `data-titles="full"`; no part overlaps a title or leaves its row; no page scrolls sideways.
- [x] 3.2 The same pages at 768 px (touch) and 1280 px (mouse). Verify: every `.title-phone` is one line with and without full titles; the 1280 px screenshots match the build before the change pixel for pixel, apart from the seeded account's own differences (avatar colour, the order of equally ranked results).
- [x] 3.3 Layout check of the touched screens. Verify: `ONLY=notes,week,month,plan,day,inbox,upcoming ENGINES=chromium WIDTHS=360,390,768 node scripts/e2e-layout.mjs` against a fresh server prints `LAYOUT OK`.
- [ ] 3.4 The whole layout check with its WebKit leg, the interface audit and the UI check's screenshots (CI). Verify: `make layout-check`, `make ux-audit`, `make ui-check`; re-baseline the 375 px stories of Screens/Notes (every row), and of the calendar agendas, Close the day and the command bar where a title is longer than one line.

## 4. Docs

- [x] 4.1 `docs/row-layouts.md`, `docs/notes.md`, `docs/interface-guide.md`; changelog fragment `changelog.d/Changed/phone-titles-everywhere.md`. Verify: `make docs-check`, `node --test scripts/repo-checks.test.mjs`.

## 5. Checks

- [x] 5.1 `npx tsc --noEmit`, `npx eslint` on the changed files, `npm test` and `npm run build` in `web/`, `node scripts/bundle-budget.mjs`, `node scripts/i18n-check.mjs`, `openspec validate phone-titles-everywhere --strict`.
- [ ] 5.2 On a phone (owner): the Notes list and a search in it, the Week and Plan agendas, Close the day and the command bar in the Android and iOS apps; Safari draws the two-line clamp and the first-line alignment as Chromium does.

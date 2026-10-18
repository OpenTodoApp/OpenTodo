## 1. Sidebar

- [x] 1.1 Search button beside the app name; the rail keeps it in the footer (`Sidebar.tsx`)
- [x] 1.2 One footer row from 768 px with Help as an icon button; phones keep the Help row (`SidebarFooter`)
- [x] 1.3 More as a menu from 768 px with a fine pointer, markers on the row and as item descriptions; inline group on touch (`MoreMenu`, `MORE_MENU_QUERY`)
- [x] 1.4 Filters and Labels hidden while empty; placeholder sentences removed from the catalogs
- [x] 1.5 `pointer-fine` density for rows, headings and the name row (`ui/patterns/Sidebar.tsx`)
- [x] 1.6 `.ui-scroller` thin scrollbar and edge fades with `useScrollEdges` (`index.css`, `ui/patterns/Sidebar.tsx`)

## 2. Tests and docs

- [x] 2.1 `sidebar.test.tsx`: desktop menu, footer row names, phone Help row and rail search, empty groups, density classes; touch helper for the inline group tests; `askEntry`, `naming` and `review` tests follow
- [x] 2.2 Guides: getting started, built-in views, review, labels and filters, filters

## 3. Checks

- [x] 3.1 `npx tsc -b`, `npm run lint`, `npx vitest run`, `make ui-lint`, `make i18n-check`, `make docs-check`, `make openspec-validate`, Chromium layout check, visual baselines in the pinned Playwright image, before/after screenshots at 1280×600

# Tasks

## 1. Brand mark and generated assets

- [ ] 1.1 Draw `web/src/ui/icons/brand.svg` to the brief of design D2 (24-unit grid, 2-unit stroke, open loop closing into a tick, mono and colour variants as two `<symbol>`s) under 2 KB with the licence note; verify with a unit test that parses the file, checks its size, the two symbol ids and that no `<text>` element exists (`npm test -- brand`)
- [ ] 1.2 Add `BrandMark` (sizes 16, 20, 24, 32; variants `mono` and `colour`; `currentColor` stroke with the closing segment in `var(--ot-accent-text)`) and `BrandWordmark` to `web/src/ui/icons/Brand.tsx`, export them from the `ui` barrel; verify with `Brand.test.tsx` (the mono mark inherits the parent's colour, the wordmark is text "OpenTodo", `aria-hidden` when decorative) and `npm run build`
- [ ] 1.3 Write `scripts/brand-icons.mjs`, which renders the colour variant in the bundled Chromium to `web/public/pwa-192.png`, `pwa-512.png`, `pwa-maskable-512.png` (safe zone), `apple-touch-icon.png`, `extension/icons/icon-{16,48,128}.png` and `web/public/favicon.svg`, and `scripts/brand-icons.test.mjs`, which re-renders and compares bytes; verify `node scripts/brand-icons.mjs` writes every file and `node --test scripts/brand-icons.test.mjs` passes, then fails after a one-byte edit to a PNG
- [ ] 1.4 Add the maskable icon to the manifest in `web/vite.config.ts` with `purpose: maskable`, keep every existing path, and include the new file in the precache; verify with the existing manifest test and by loading the built app in Chromium: the manifest lists five icons and the service worker precache contains them (`npm run build`, the PWA test in `npm test`)
- [ ] 1.5 Replace `<img src="/favicon.svg">` with `BrandMark` and the wordmark on the sign-in, setup, reset, invitation, project-invite and email screens; verify with `AuthScreen.setup.test.ts` and a grep test that no screen under `web/src/app` references `favicon.svg` (`npm test`)
- [ ] 1.6 Add `brand/` (source, mono, colour, wordmark, `icon-512.png`) to `scripts/site-bundle.mjs`, document the path in `docs/site-bundle.md` and add the byte comparison to `scripts/site-bundle.test.mjs`; verify `make site-bundle` produces the folder and `node --test scripts/site-bundle.test.mjs` fails when a brand file is stale
- [ ] 1.7 Raise the extension version in `extension/manifest.json` and `package.json`, add the regenerate step to the extension README's release checklist; verify `make test-extension` (the locales test and the new icon comparison) and `make extension` packages the new icons

## 2. Tokens and primitives

- [ ] 2.1 Add `--ot-sidebar` (3 % accent in light, 4 % in dark, oklab) in all three token blocks of `web/src/index.css`, the plain canvas in the high-contrast blocks, and `bg-sidebar` in `@theme inline`; verify with `contrast.test.ts` (the dark blocks stay identical) and a new pair set in `src/ui/tokens/pairs.ts` for quiet, default, strong text and the accent icon on `--ot-sidebar`, failing when one is under 4.5:1 or 3:1 (`npm test -- contrast`)
- [ ] 2.2 Rework `SidebarItem` tones per design D4 (quiet at rest, default on hover and focus, strong text and accent icon when active; the tone utilities from `tokens-v2` or the fallback tokens), with `data-tone` on the row for tests; verify with `Sidebar.test.tsx` cases for the three states and `make ui-lint`
- [ ] 2.3 Generalise `.ui-count-quiet` into `.ui-reveal` (opacity only, visible on group `:hover`, `:focus-within` and `(pointer: coarse)`, transition `--duration-ui`) in `index.css`, apply it to `SidebarGroup`'s actions, keep the header height fixed, and put the item count into the header's accessible name in every state; verify with `Sidebar.test.tsx` ("Projects, 12 items" open and closed, actions present in the DOM, focus makes them visible) and a happy-dom test that the header's height is equal with and without hover
- [ ] 2.4 Add `SidebarHeader` (`left` slot, search button, rail behaviour) to `web/src/ui/patterns/Sidebar.tsx`; verify with `Sidebar.test.tsx` (rail shows the mark alone with tooltip "OpenTodo"; a custom `left` keeps the search button and its `data-palette-button`)

## 3. The app's sidebar

- [ ] 3.1 Use `SidebarHeader` with `BrandMark` and `BrandWordmark` in `web/src/app/Sidebar.tsx`; verify with `sidebar.test.tsx` (header row at most 40 px with a fine pointer, mark present, no `img`) and `budget.test.tsx` (six primary destinations, two rows of chrome unchanged)
- [ ] 3.2 Render More as a group-style heading on a fine pointer from 768 px (`aria-haspopup="menu"`, hint-size uppercase label, chevron, no icon, `aria-current` while inside) and as the inline group with the same header style on a coarse pointer; verify with `sidebar.test.tsx` (desktop menu opens, phone group expands, current mark while Someday is open)
- [ ] 3.3 Move the review-due `StatusDot` and its tooltip text from the More heading to the Review entry in every mode, and the Updates badge to the Updates item; verify with `sidebar.test.tsx` (Companion: no dot on More, dot and description on Review inside the menu; Open Loops first: dot on the primary Review) and `sidebar.stories.tsx` Markers story updated
- [ ] 3.4 Apply `bg-sidebar` to the sidebar column from 768 px with a fine pointer in `Shell.tsx`, switch the sticky group headers to it, keep `bg-surface` on the drawer; verify with `shell` and `sidebar` tests (class present on desktop, absent in the drawer) and `make layout-check` (no seam: the sticky header's background equals the sidebar's)
- [ ] 3.5 Project, label, filter and favourite rows pick up the tones with no behaviour change; verify `sidebarDrop.test.tsx`, `sidebar.test.tsx` and `FavouritesGroup` tests pass unchanged

## 4. The footer

- [ ] 4.1 Replace `TrackingIndicator`'s footer line with `RunningPill` inside the footer row (pill body opens the task; Stop inside; account menu keeps the person's name; rail shows the time alone with tooltip and menu); verify with `sidebarFooter.test.tsx` (one row in both states, the row's height unchanged when tracking starts, names "Tracking 1:05 · Write the report" and "Stop", the menu named by the person) and the phone bar test of `time-tracking` still passing
- [ ] 4.2 Keep the one-time announcements and the minute tick; verify `TrackingIndicator`'s announcer test passes against the pill and no live region ticks (`npm test -- tracking`)
- [ ] 4.3 Add the stop-on-another-device case: the pill disappears on sync without a reload; verify with a vitest that writes a closing op for the running entry and asserts the account name returns

## 5. Translations and copy

- [ ] 5.1 Add the new strings (the mark's tooltip, "Stop", the group count phrase "{n} items", "More" as a group label) to the five catalogs; verify `node scripts/i18n-check.mjs`
- [ ] 5.2 Check the German and Portuguese sidebar at 15 rem for the wordmark row and the pill (title truncates, nothing wraps); verify by the Storybook language switch and the baselines of task 6.1

## 6. Workbench and baselines

- [ ] 6.1 Add `Foundations/Brand` (mono at 16, 20, 24, 32 beside the row checkbox; colour variant; wordmark; emerald and one other accent theme) and extend `Screens/Sidebar` with `HoverControls`, `RunningEntry`, `MoreGroup` and a tinted `Default`, each in light and dark at 375 and 1280 px; verify `npm run storybook` renders them, the axe gate passes, and the baselines are generated with the UI baselines workflow (or `make ui-baselines` with Docker) and committed under `web/src/ui/__screenshots__/`
- [ ] 6.2 Review the 16 px Brand baseline by eye in both themes for the loop-and-tick legibility criterion and record the chosen opening angle in design D2; verify `make ui-check` passes after the baseline is frozen

## 7. Documentation and reconciliation

- [ ] 7.1 Update `docs/design-system.md` (a Brand section: the brief, the source file, the generation script, the variants and sizes), `docs/interface-guide.md` (the sidebar column: tones, hidden controls, the one-row footer with the pill, More as a group, the tinted surface) and regenerate `docs/images/sidebar-*.webp`, `signin-*.webp` and `today-*.webp` with `make docs-screenshots`; verify `make docs-check`
- [ ] 7.2 After `quiet-sidebar` is archived, edit `openspec/specs/app-shell/spec.md` "Quiet markers in the sidebar" so the marker sentence names the Review entry only and replace its "Review due on More" scenario with the desktop scenario of "More is a labelled group"; verify `make openspec-validate` and a grep that no spec text places a marker on More
- [ ] 7.3 Run `make check`, measure the main bundle and the binary before and after and record them in design D12, and add the CHANGELOG.md entry under Unreleased (new mark and icons with no reinstall needed, the quieter sidebar, the footer pill, More as a group, the review-due dot's new place, the extension version); verify `make check` passes and the entry names every user-visible change

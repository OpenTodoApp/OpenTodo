# Tasks

## 1. Web app

- [x] 1.1 `MenuTailContext` in `web/src/ui/Menu.tsx`; the overlay `Menu` (`kind="menu"`) draws the handed items after a separator, claims them while mounted and resets the context for its content. Verify: `npx vitest run src/ui/patterns/phoneBarHelp.test.tsx` (the item is last, after a separator; End focuses it; a picker step shows none).
- [x] 1.2 `PageActions helpInMenu`: Help as a menu item with the menu's button as the guide's trigger; the button only while no menu holds the item. `PhoneBar` sets it; the header from 768 px does not. Verify: the same test (a page without a menu, a non-menu in the menu slot and the desktop header keep the button), `npx tsc --noEmit`, `npx eslint` on the changed files.
- [x] 1.3 The phone bar of the page header stories follows the shell. Verify: `npx tsc --noEmit`.

## 2. Checks in a browser

- [x] 2.1 Built app, seeded account, Chromium at 360 px with touch: Inbox, a project, Today, Upcoming, Notes and the calendar have no Help button in the bar; Help is the last item of each menu, opens the screen's section by tap and by Enter, End, Enter, and focus returns to the menu's button; Settings keeps the button and it opens the guide. Verify: before and after screenshots and the measured title widths (Inbox 42 → 90 px, a project 104 → 152 px).
- [x] 2.2 At 1280 px the headers of the Inbox, a project and Today list the same controls as before, ending with Help. Verify: the same run.
- [ ] 2.3 On a phone, in the Android and the iOS app: Help from the menu of the Inbox and of a project, and from the bar in Settings.

## 3. Docs and release

- [x] 3.1 `docs/getting-started.md` (where Help is on a phone) and `docs/interface-guide.md` (the phone bar). Verify: `make docs`, `make docs-check`.
- [x] 3.2 Changelog fragment `changelog.d/Changed/phone-header-room.md`. Verify: `node --test scripts/repo-checks.test.mjs`.
- [ ] 3.3 Re-baseline the phone-width UI screenshots of the pages with a menu and of the page header stories.

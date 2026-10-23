## 1. Frame and header widths

- [x] 1.1 Give the header the content width (D1): in `web/src/index.css` every child of a non-`full` page frame takes `--page-width`, a sticky header that width plus its bleed (2 rem, 4 rem from 768 px); verify the Inbox's header actions end at the list's right edge at 1920 px
- [x] 1.2 Lists at 60 rem (D3): `--page-width: 60rem` for `list`; the cold-start placeholder in `web/src/app/App.tsx` at the left edge with the list's width; verify `pageRhythm.test.tsx` pins 60 rem and the header rules
- [x] 1.3 One 72 rem frame for a project in every layout (D2): `data-page-project` on the list page's frame in `TaskListView.tsx` and `.page-frame[data-page-project] { max-width: 72rem }`; verify the List/Board/Timeline control keeps its position between layouts at 1280 and 1440 px and the board ends at the header's right edge at 1920 px

## 2. Tests, docs and baselines

- [x] 2.1 Extend `scripts/e2e-views.mjs` (D4): the header's actions end at the content's right edge on Inbox, Today and a project's list and board at 1920 and 2560 px; verify it passes against a fresh server
- [x] 2.2 Before/after screenshots at 1280 and 1920 px, light and dark, for the Inbox, Today, a project list and a board, reviewed and attached to the pull request; verify by the PR comment
- [x] 2.3 Update `docs/interface-guide.md` (the frame table and the widths) and the component comments, and add the CHANGELOG entry under Unreleased → Changed; verify `make docs-check`
- [x] 2.4 Regenerate the visual baselines that change in the pinned Playwright image; verify `make ui-check` in CI
- [x] 2.5 Run `make check` with TZ=UTC, open the pull request and get CI green

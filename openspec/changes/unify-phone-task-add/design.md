# Design

## Context

See proposal.md for motivation. Dedicated PhoneList already omits the top input; TaskListView and the shared section/board controls still render inline inputs below 768 px. Shell owns one sheet and registers a no-argument imperative opener. SectionQuickAdd currently clears the source section for an explicit different project.

## Goals / Non-Goals

Use one existing sheet for top-level phone list/section/board capture while preserving desktop inputs and specialized row/subtask editors. Do not add native code, new data fields, or a general dialog framework.

## Decisions

1. Extend the existing sheet request with optional typed project/section context and an optional trigger ref for focus return. Keep no-argument callers compatible. Shell stores the current request and resets it on close/navigation/global opening. This avoids separate sheet instances and duplicate drafts.
2. Use the existing viewport media query (768 px), independent of the phone-screen preference and narrow-column header detection. Render top inputs only on desktop. Keep the standalone component fallback for section inputs when no Shell is mounted, so isolated component consumers remain usable.
3. Merge context before parsed task fields for both single and batch input. Clear the source section if the effective project differs. Keep existing creation, reusable-list, batch, placement and Undo helpers. Show the source section's name in the sheet using existing translated wording so the destination is visible.
4. Use the original control as the overlay anchor when supplied, and retain the floating button for ordinary openings. The existing overlay handles safe areas, keyboard position and dismissal. No new overlay inventory entry is needed; add entry-path browser coverage.
5. Render inline content conditionally rather than hiding a focusable field in CSS. Crossing the breakpoint changes the available editor; no transfer between independent desktop and sheet drafts is introduced. Do not change row-relative Vim insertion semantics; the ordinary global quick-add action opens the sheet on phones.
6. Data model, op schema, APIs and dependencies are unchanged. Container/runtime growth is limited to small TypeScript branches; verify the bundle budget. Removing the mobile row reduces chrome and does not add visible task properties, sidebar destinations, scroll regions or shortcuts, keeping the interface guide's limits (2 chrome rows, 7 properties, 6 primary destinations, 3 scrollers).

## Risks / Trade-offs

- Stale section context → reset on close and route change, test global reopen and explicit different-project input.
- Preference and board layout coverage gaps → test both phone preferences, a board, No section, read-only state and desktop.
- Test isolation → browser checks use throwaway data directories and free ports, without altering an existing installation.

## Migration Plan

Build and deploy the web/server artifact normally; Android loads the updated UI from its configured server. No data migration or APK release. Rollback is the previous web/server build.

## Verification

- Focused interaction suites: 98 tests passed; the updated interface-budget suite passed all 17 tests.
- Full web suite: 11,089 tests passed, 4 skipped; all 24 performance tests and the Go suite passed. The remaining checks were confirmed with `make check -o test-go -o test-web` (exit code 0). The long full run's wrapper reported termination status 143 after logging its final passing gate, so the remaining gates were rerun separately.
- The browser regression `scripts/e2e-phone-task-add.mjs` passed in Chromium and WebKit with both phone-screen preferences and desktop, light and dark. It verifies project/section destinations, No section, offline creation and reconnect, send after input blur, and no serious/critical axe violations.
- Chromium layout passed at 360/390/768 px and with the earlier phone layout at 390 px. WebKit layout passed at 390 px. Portrait and landscape safe-area checks passed.
- Bundle: entry 99.3 KB gzip of 148 KB; first load 668.5 KB of 712 KB. No runtime dependency was added. Docs and strict OpenSpec validation passed.
- The contributor reports that the phone preview works. A specific walkthrough of software-keyboard dismissal and Android system Back remains recommended during review.
- Before/after screenshots are generated under `dist/issue-2105-before/` and `dist/issue-2105-after/`; they are review artifacts, not committed application assets.

The change remains open for review. Archive it in the pull request that finishes it, following CONTRIBUTING.md.

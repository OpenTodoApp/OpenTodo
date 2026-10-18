# Tasks

## 1. Data fields (design D2, D4, D5, Data model impact)

- [x] 1.1 Add `method_mode` to `Schema["user_prefs"]`, `reviewed_at` to `Schema["project_prefs"]`, and `daily_at`, `monthly_at`, `focus_date` and `focus` to `Schema["review"]` in `internal/sync/ops.go`, each with a comment naming this change. Verify with `go test ./internal/sync/...`: a case that each field validates with its kind, one that a wrong kind is rejected, and one that the fields resolve to the personal scope for a shared project's `project_prefs`.
- [x] 1.2 Add the fields to `web/src/lib/types.ts` and the defaults in `web/src/lib/ops.ts`, plus a `useMethodMode()` hook that reads `user_prefs.method_mode` and maps unknown or empty values to `lists`. Verify with vitest: the "Unknown value from a newer client" and "Concurrent choices" scenarios (LWW across two simulated devices), and that reading writes no op (`npm test` in web/).
- [x] 1.3 Confirm the JSON export and import round-trip the new fields and that `internal/activity` derives no event from them. Verify with an export test in `internal/sync` or `internal/importer` that includes each field, and with the shared activity fixture still passing (`go test ./...`).

## 2. Vocabulary and derived rules (design D1, D3)

- [x] 2.1 Create `web/src/lib/method/vocabulary.json` (ids, English names and descriptions, routes and shortcut ids for moves) and `web/src/lib/method/index.ts`, which exposes it through `msg()`. Run the i18n extractor and add the six catalog entries. Verify with `make i18n-check` and a vitest test that every id has a name and description and that ids are unique.
- [x] 2.2 Create `web/src/lib/method/rules.ts` with `isActionable`, `nextActionOf`, `withoutNextAction`, `isStalled` and `waitingOf` (thresholds 21 and 90 days as named constants). Verify with vitest cases for every scenario in `specs/method-views/spec.md` ("First in order", "Blocker completed elsewhere", "Assigned to someone else", "Only Someday tasks", "Only a deferred task", "Stalled", "New project") (`npm test`).
- [x] 2.3 Add the shared fixture `internal/digest/testdata/next_action_fixture.json` (projects, sections, tasks and memberships, with the expected next action per project and the "without a next action" list) and a vitest test that runs `rules.ts` over it. Verify with `npm test`.
- [x] 2.4 Extend `internal/digest` (`Task` gains `Start` and `BlockedBy`, which `TaskOf` reads; list order is not needed for this rule) and rewrite `WithoutNextAction` to the shared rule. Verify with a Go test over the same fixture and the existing digest tests (`go test ./internal/digest/...`), and update `docs/review-and-statistics.md`'s digest paragraph with the new definition.

## 3. Method documentation and in-app references (design D8)

- [x] 3.1 Write `docs/method/`:
  - `overview.md`, with the loop diagram first
  - `catch.md`, `clarify.md`, `place.md`, `do.md`, `review.md`
  - `places.md`, `rhythms.md`, `horizons.md`
  - `set-up.md`, "Set up in ten minutes"
  - `coming-from-gtd.md`, with the glossary and the non-affiliation sentence

  Each page is under 600 words with `screens: [method/<id>]` front matter, using the vocabulary's exact names. Verify with `npm run docs:check` in web/ and `make docs`.
- [x] 3.2 Add the "Learn Open Loops" entry to the Help landing and link the method chapter from `docs/README.md` / the guide list. Verify with the Help landing test updated to nine entries and the "Learn Open Loops" scenario (`npm test`).
- [x] 3.3 Build `MethodLink` (subtitle link, `openHelp('method/<move>')`, nothing in `lists` mode) with a story, and pass it in the subtitles of Inbox, triage, Someday, Review, Daily check and Monthly look. Verify with component tests for "Companion user on the Inbox", "Lists only" (header DOM identical to before) and "Offline", plus `make ui-check` and `budget.test.tsx` (`npm test`, `npm run build`).

## 4. Next and Waiting views (design D3, D9)

- [x] 4.1 Add `/next` and `/waiting` routes, lazy views on the grouped list rendering (context groups with "Anywhere"; assignee groups then "Blocked by another task"), their empty states, and the shortcuts `g` then `Shift+N` and `g` then `Shift+W` in the registry. Verify with component tests for "Complete and continue", "Empty", "Delegated in triage", "Blocker done" and "Two contexts", and with the shortcut registry test (`npm test`).
- [x] 4.2 Add `loop`, `next` and `waiting` to the More group, the command palette, the start view choices and the promotable destinations. Verify with `sidebar.test.tsx` cases for "Companion promotes Next" and "Older client", and with the palette test (`npm test`).
- [x] 4.3 Pass `MethodLink` on Next (Do) and Waiting (Place), and document both views in `docs/views.md` and `docs/method/places.md`, with screenshots through `make docs-screenshots`. Verify with `npm run docs:check` and `make docs` regenerating `docs/keyboard.md`.

## 5. The review becomes the Rhythms (design D4, D5, D6)

- [x] 5.1 Give the `Tabs` primitive horizontal overflow with the selected tab scrolled into view, plus a story at 360 px. Verify with `make ui-check` and a Tabs test.
- [x] 5.2 Rework `web/src/lib/review.ts` to the seven steps with the new done rules (Projects done when every walk project has `reviewed_at` within seven days and none is without a next action). Verify with vitest cases for "Inbox step", "Overdue step", "A capture during the sweep" and "Waiting step", and update `review.test.tsx` (`npm test`).
- [x] 5.3 Update `ReviewView.tsx`: phase-grouped tabs, the Mind sweep step (trigger prompts, quick add that keeps focus), the Waiting step and the Someday step (`n`, `c`, Delete). Verify with component tests for "Rapid capture" and "Promote a someday task" and an axe check (`npm test`).
- [x] 5.4 Build the project walk card mode (queue ordered by `project_prefs.reviewed_at`, card contents, the keys `r`/`q`/`o`/`a`/`j`/Space/`k` registered in the shortcut table, the live region, the summary after the last card, touch buttons at 360 px). Verify with component tests for "Add a next action, then mark reviewed", "Resume on another device", "Shared project the user cannot edit", "Archive offline" and both "Personal review stamp" scenarios, and with the layout check at 360 px (`npm test`, `make layout-check`).
- [x] 5.5 Build the Daily check (`/review/daily`, `g` then `Shift+R`, `f` focus toggle up to three, "Done for today") and the Monthly look (`/review/monthly`: Areas, Old someday, Trend), both in the header menu. Verify with component tests for "Pick a focus", "Next day", "Done for today", "Areas with stalled children" and "Daily and weekly on different devices" (`npm test`).
- [x] 5.6 Implement the rhythm markers per mode on the sidebar Review entry and the once-a-day daily check toast in `first` mode (a per-device date in local storage). Verify with tests for "Lists only" and "Open Loops first in the morning", plus "Review due" (`npm test`).
- [x] 5.7 Rewrite `docs/review-and-statistics.md` for the seven steps, the walk, the Daily check and the Monthly look, and `docs/method/review.md` and `rhythms.md` to match, with new screenshots. Refresh the `weekly-review` assistant skill's instructions to follow the new steps (same id). Verify with `npm run docs:check`, `make docs`, and the assistant skills test still listing five skills (`go test ./internal/assistant/...`).

## 6. How you work, the Loop home and the sidebar (design D2, D7, D9)

- [x] 6.1 Add "How you work" to Settings → You (three choices with descriptions, "Learn the method", the start-view offer for `first`, the starter-label offer). Verify with component tests for "Pick Open Loops first", "Learn before choosing", "Accept the starter labels", "A label of the same name exists" and "Contexts already exist" (`npm test`).
- [x] 6.2 Make `sidebarLayout.ts` mode-aware (`first`: Loop home, Inbox, Today, Next, Waiting, Review; promotions set aside but kept) and disable the destination switches in Settings → Appearance in `first` mode. Verify with `sidebar.test.tsx` cases for "Default sidebar" (four destinations), "Open Loops first sidebar", "Promotions kept across modes" and "Open Loops first" (appearance), and with `budget.test.tsx` holding at six (`npm test`).
- [x] 6.3 Build the Loop home (`/loop`, `g` then `Shift+L`, five tiles with live counts, today's focus rows, one column at 360 px, list semantics). Verify with component tests for "Morning on the Loop home", "A capture from another device" and "Keyboard path", plus an axe check and the layout check at 360 px (`npm test`, `make layout-check`).
- [x] 6.4 Verify the mode is presentation-only. Write a test that switching through all three modes writes exactly one `user_prefs` op each and no op on any task, project, label or view ("Switching back loses nothing"), and one for "Existing account after upgrade" (`npm test`).
- [x] 6.5 Document Settings → You → How you work in `docs/settings-you.md` and `docs/method/set-up.md`, with screenshots of the three sidebars. Verify with `npm run docs:check` and `make docs`.

## 7. First run (design D10)

- [x] 7.1 Rework the first-run card's second step to "How do you want to work" (Companion preselected, appearance as its second row, "Learn the method", follow-up offers). Verify with component tests for "Complete the first run", "Open Loops first from the start", "Skip all" and "Learn before choosing" (`npm test`), and update `docs/getting-started.md`.

## 8. Site bundle (design D1)

- [x] 8.1 Extend `scripts/site-bundle.mjs` to write `method.json` (schema 1, generated from `vocabulary.json` and the six catalogs) and the `method` fact, and document both in the bundle README table. Verify with the site-bundle script's tests ("Same words on the website", "Website gates the method page", and the existing "Older website, newer manifest") (`node --test scripts/`).

## 9. Roadmap, changelog and integration

- [x] 9.1 Add the "Open Loops method" row (`open-loops-method`) to section 3 of `ROADMAP.md` and a CHANGELOG entry under Unreleased that mentions the changed "without a next action" definition in the digest. Verify with `make repo-check`.
- [x] 9.2 Extend `scripts/e2e-smoke.mjs`:
  1. Pick Open Loops first.
  2. Check the six sidebar destinations.
  3. Open the Loop home.
  4. Process one Inbox task.
  5. Walk two projects with `r`.
  6. Pick a daily focus.
  7. Switch to Lists only and check the original sidebar.

  Verify with the smoke script against `make run`.
- [ ] 9.3 Manual smoke on `make dev` with two browser profiles of the same user and one of a second member of a shared project:
  - per-user review stamps on the shared project
  - a daily check on one profile clearing the marker on the other
  - offline walk and reconnect
  - a screen-reader pass over the Loop home and the walk

  Record the result in the change folder notes, then run `make check`.

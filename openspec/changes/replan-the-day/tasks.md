## 1. Packer

- [ ] 1.1 `web/src/lib/replan.ts`: `missedBlocks(input)` and `replan(input)` as pure functions (clock, logical today, grid end, tasks, permissions, assignee, running entry, events, Calendars toggle as inputs); no imports from `app/`
- [ ] 1.2 `web/src/lib/replan.test.ts`: every scenario of the spec's "Missed blocks" and "packs" requirements (in progress not missed, viewer and other assignee left out, running timer left out, around a meeting, order kept, hole filled, does not fit, after the grid end, calendars hidden, free and all-day events ignored, day start past midnight, deterministic for equal input); `npm test`

## 2. Entry points

- [ ] 2.1 Calendar header lead line "<n> blocks behind · Re-plan" in Day and Week when today is shown; overflow item; both hidden without missed blocks; `web/src/app/replan.test.tsx` (happy-dom)
- [ ] 2.2 Today overflow item opening the Day view with the preview; command palette command enabled under the same condition; registry test (`Registry stays complete`) passes; no shortcut added (shortcut registry test unchanged)

## 3. Preview and apply

- [ ] 3.1 `web/src/app/calendar/ReplanPreview.tsx`: ghost blocks, faint originals, the bar with count, unfit choice, Apply, Cancel; Enter/Escape; grid drag and placement keys paused; `.ui-block--ghost` in `index.css` from tokens only (`make ui-lint`)
- [ ] 3.2 Live recompute on local data change and at the next 15-minute mark; "Nothing to re-plan" close; test with a sync-applied completion
- [ ] 3.3 Phone bottom sheet below 640 px (48 px targets); test at 390 px
- [ ] 3.4 Apply: one `mutateMany` batch of `due` edits only, zone kept like a drag, Move to tomorrow, pre-write recheck and "n changed meanwhile", one Undo restoring all; tests: batch contents, undo restores all, offline queues, zoned task, deadline warning
- [ ] 3.5 Offline beyond the event cache shows "Calendars unavailable offline" in the bar; test with an empty cache
- [ ] 3.6 Strings in the six catalogs; `make i18n-check`
- [ ] 3.7 Story `calendar/replanPreview.stories.tsx` (Day at 1280 px, phone sheet at 375 px, light and dark) and baselines; `make ui-check`

## 4. Docs and checks

- [ ] 4.1 `docs/time-blocking.md` (or the calendar guide): "Re-plan the rest of the day", what counts as missed, what is never moved, Undo, and that the CLI and MCP have no re-plan (agents use `schedule_tasks`); `make docs-check`
- [ ] 4.2 CHANGELOG Unreleased "Added" (at archive time)
- [ ] 4.3 `cd web && npm test && npm run build`; `go test ./...` (unchanged server); `make check`; `make openspec-validate`

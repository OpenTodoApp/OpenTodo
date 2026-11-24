# Tasks

## 1. Published data

- [x] 1.1 `shellCompleted` builds today's count and the 7-day series (`{ day, done }`) with `lib/stats.ts` `compute`, for the viewer's logical days, and the publisher adds it to the widget blob with the Today list; locked: today's count only. Verified: `web/src/lib/shellPublish.test.ts`, and the bridge fixtures `widget-completed.json` and `widget-completed-locked.json`.

## 2. Android widget

- [x] 2.1 `CompletedWidget` and `CompletedModel` (also answers #1240): today's count, seven theme-coloured bars with weekday letters and a spoken description, the update time, a tap opening Statistics; locked: the count and a note, no bars. Verified: `make android` (unit tests incl. `CompletedModelTest` and `BridgeFixtureTest`, lint, translations, build).
- [ ] 2.2 A check on a real Android phone (after the merge; a cloud session has none).

## 3. iOS widget (follow-up)

- [ ] 3.1 A Completed WidgetKit widget reading the same publication; it needs Xcode, so it is a separate issue.

## 4. Docs, release

- [x] 4.1 Docs: the Android app's Widgets section describes the Completed widget. Verified: `make docs-check`.
- [x] 4.2 Changelog fragment `changelog.d/Added/completed-widget.md`. Verified: `make repo-check`.

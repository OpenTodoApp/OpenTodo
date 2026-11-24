# Proposal

## Why

A home-screen **Completed** widget (GitHub issue [#1531](https://github.com/OpenTodoApp/OpenTodo/issues/1531)): a count, and a small bar chart of the last several days, of the tasks a person completed. Seeing what you *did* get done, not only what is left, is good for motivation. Today the apps have one widget, **Today** (tasks due today and overdue); this adds a second. It should exist on both platforms, so it also answers the Android widget request ([#1240](https://github.com/OpenTodoApp/OpenTodo/issues/1240)).

The freeze has ended early and the owner asked for it. This change builds the web side and the Android widget; the iOS widget needs Xcode and follows separately.

## What Changes

- The web app computes a short **completed-per-day series** (the last 7 days, each day's count of tasks the person completed) and publishes it to the shell alongside the Today widget data, through the same bridge and on the same debounced recompute — the widget never makes a request of its own.
- A new **Completed** widget on Android reads that series and shows today's completed count and a bar per day of the last week. It shows the time of the last update, like the Today widget. The iOS widget is a follow-up.
- While an encrypted account is locked, only today's count is published, and the widget shows that number without bars (decided).

## Design

- **D1 — The data.** Reuse `web/src/lib/stats.ts`, which already computes completed-per-day counts for the Stats screen, to build a 7-entry `{ day: "YYYY-MM-DD", done: n }` series for the viewer's logical days. Publish it in the widget blob next to the Today list (`shellPublish.ts` → `ShellWidgetData`), recomputed on every store change as today's data already is. Numbers and dates only, never task content. Locked: today's count only, to match Today (decided). `stats.ts` `compute` over the last 7 days gives exactly Statistics' count.
- **D2 — The widget.** Android: a second app-widget reading the same stored blob, today's count in the header and seven bars with a weekday letter each, scaled to the busiest day (a day with any completion keeps a sliver); a tap opens Statistics. The bars are `ProgressBar`s with a bottom-filled clip drawable in `@color/accent` over `@color/widget_track`, so the launcher resolves light and dark itself (a drawn bitmap would keep the colours of the moment it was drawn, #966). The bars have a spoken description (each weekday and its count). iOS: the same as a WidgetKit widget, in a follow-up.
- **D3 — No new mechanism.** It rides the existing publish-on-change + hourly-refresh path, the existing App Group (iOS) / private storage (Android), and the existing "show the update time" and encrypted-account rules. The widget makes no request of its own.
- **D4 — Scope.** Read-only; no App Intents, no completing from the widget (a separate idea the issue did not ask for). What a day's "completed" counts matches the Stats screen's definition, so the widget and the screen never disagree.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `native-shells`: a new "Completed widget" requirement beside the Today widget, for both shells.

## Impact

- Web: `completed` in the published widget blob and `shellCompleted` (reusing `stats.ts`). Android: `CompletedWidget`, `CompletedModel`, a layout, a bar drawable, styles, a track colour, strings in every locale and the manifest entry; the redraw follows each publication. No server, op-log, API, dependency or new-permission change; the series is a few hundred bytes. No change to the Today widget.
- Each platform ends with a check on a real device, after the merge.

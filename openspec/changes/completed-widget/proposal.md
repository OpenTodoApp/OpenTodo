# Proposal

## Why

A home-screen **Completed** widget (GitHub issue [#1531](https://github.com/OpenTodoApp/OpenTodo/issues/1531)): a count, and a small bar chart of the last several days, of the tasks a person completed. Seeing what you *did* get done, not only what is left, is good for motivation. Today the apps have one widget, **Today** (tasks due today and overdue); this adds a second. It should exist on both platforms, so it also answers the Android widget request ([#1240](https://github.com/OpenTodoApp/OpenTodo/issues/1240)).

This is `enhancement` + mobile, written as a proposal because the mobile apps are paused and the project is in a feature freeze until the end of November. No native build now; this is the design, ready for when the freeze lifts.

## What Changes

- The web app computes a short **completed-per-day series** (the last 7 days, each day's count of tasks the person completed) and publishes it to the shell alongside the Today widget data, through the same bridge and on the same debounced recompute — the widget never makes a request of its own.
- A new **Completed** widget on iOS and Android reads that series and shows today's completed count and a small bar chart of the recent days. It shows the time of the last update, like the Today widget.
- For an encrypted account it shows the chart only from a publication made while unlocked, and a count (or nothing) once locked — the same rule the Today widget already follows.

## Design

- **D1 — The data.** Reuse `web/src/lib/stats.ts`, which already computes completed-per-day counts for the Stats screen, to build a 7-entry `{ day: "YYYY-MM-DD", done: n }` series for the viewer's logical days. Publish it in the widget blob next to the Today list (`shellPublish.ts` → `ShellWidgetData`), recomputed on every store change as today's data already is. Numbers and dates only — never task content — so an encrypted, locked account can still show the chart shape or a count without leaking titles (decide: counts only when locked, to match Today).
- **D2 — The widget.** iOS: a second WidgetKit widget (medium) beside Today, drawing the bars from the published series with today's count large; a tap opens the app. Android: the same, as a second app-widget reading the same stored blob. Both follow the theme's colours and the shell's existing widget styling.
- **D3 — No new mechanism.** It rides the existing publish-on-change + hourly-refresh path, the existing App Group (iOS) / private storage (Android), and the existing "show the update time" and encrypted-account rules. The widget makes no request of its own.
- **D4 — Scope.** Read-only; no App Intents, no completing from the widget (a separate idea the issue did not ask for). What a day's "completed" counts matches the Stats screen's definition, so the widget and the screen never disagree.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `native-shells`: a new "Completed widget" requirement beside the Today widget, for both shells.

## Impact

- Web: a small addition to the published widget blob (a 7-entry number series) and its computation (reusing `stats.ts`). Native: one new widget per platform, reading existing published data. No server, op-log, API, dependency or new-permission change; the series is a few hundred bytes. No change to the Today widget.
- Honours the feature freeze and the mobile-app pause: design only; the native build waits for the freeze to lift and the owner's go-ahead, and each platform ends with a check on a real device.

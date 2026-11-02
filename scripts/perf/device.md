# Measuring the reference devices

Before every minor release the device budgets of [docs/performance.md](../../docs/performance.md)
are measured by hand and recorded in `docs/performance/results-<version>.md`
(OpenSpec change performance-10k, design D5). The CI runner measures the desktop,
phone-profile and server budgets every night; these steps cover what only real
hardware can tell.

## Devices

- **Android**: a 2022 mid-range phone (Pixel 6a or Galaxy A54 class), the Android app
  (`mobile/android`), a debug build so its WebView can be inspected.
- **iPhone**: an iPhone 12, the iOS app, Web Inspector enabled.
- **Server**: a Raspberry Pi 4 with 4 GB running the arm64 image.

## The account

On a computer, build the test account and copy it to the Pi:

```sh
go run ./cmd/perfseed -data perf-device
scp perf-device/opentodo.db pi:/srv/opentodo/data/   # the Pi's data directory, server stopped
```

`perf-device/perfseed.json` has the email and password (`perf@example.com`,
`perf-password-10k`), the big project's id and the search term.

## The server (Raspberry Pi 4)

Run the server benchmark against the Pi from the computer (the server half of
`make perf` measures a server it starts itself, so on the Pi build it there):

```sh
GOOS=linux GOARCH=arm64 go test -tags perf -c -o perf.test ./internal/perf
scp perf.test perf-device pi:
ssh pi 'PERF_BIN=/usr/local/bin/opentodo PERF_FIXTURE=perf-device ./perf.test -test.v -test.run ServerBudgets'
```

Record each median against the **Raspberry Pi 4** column (four times the CI server's limits).

## The phones

Sign in to the Pi (or any server holding the account) in the app on a phone that
has never synced this account, then connect the browser tools: `chrome://inspect`
for the Android WebView, Safari → Develop → the iPhone for iOS. In the console:

```js
// First sync: from the start of the page load to the end of the first sync, in seconds.
performance.getEntriesByName('ot:sync-idle')[0].startTime / 1000
```

Then, each five times, taking the median:

1. **Cold start**: close the app from the app switcher, open it on Today, and read
   `performance.getEntriesByName('ot:list-ready')[0].startTime`.
2. **Open the 2,000-task project**: tap **Big backlog** in the sidebar; the time is
   `ot:list-ready`'s `startTime` minus the time of the tap (record
   `performance.now()` in the console just before, or use the Performance panel).
3. **Search keystroke**: open search, type the search term (`zephyr`) a letter at a
   time; each `ot:search-results` mark follows its keystroke (Performance panel,
   Timings track). Record the 95th percentile of the gaps.
4. **Complete a task**: in Big backlog, tick ten tasks; in the Performance panel,
   the gap from each tap to the frame that shows the tick. Record the 95th percentile.
5. **App memory**: Android `adb shell dumpsys meminfo app.opentodo` (TOTAL PSS);
   iPhone Xcode's memory gauge (footprint), after the steps above.

## The record

`docs/performance/results-<version>.md`:

```markdown
# Reference devices, <version>

| Device | OS | App version | Date |
| --- | --- | --- | --- |
| Pixel 6a | Android 15 | 1.1.0 (1100) | 2027-01-10 |

| Metric | Android | iPhone | Raspberry Pi 4 |
| --- | --- | --- | --- |
| `cold-start` (ms) | 2,410 | 1,980 | — |
| `first-sync` (s) | 97 (over budget: #123) | 64 | — |
| `server-start` (ms) | — | — | 1,240 |
```

A value over its budget is allowed only with a link to the issue that tracks it.
For the notes fixture's phone budgets, that issue proposes loading note bodies on
demand (`notes-on-demand`) rather than raising the budget.

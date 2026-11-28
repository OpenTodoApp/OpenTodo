# Proposal

## Why

On Android a task in the Today widget is completed with one tap on its circle (requirement "Widgets", android-widget-list D2). The iPhone's Today widget only lists tasks, so the same tick means opening the app, finding the task and completing it there. iOS 17 widgets can run an App Intent from a button, which is enough to do what Android does.

## What Changes

- **A check circle on each row of the iPhone Today widget**, on iOS 17 and later, when the web app's publication says it can complete tasks (`actions: ["complete"]`) and the account is not locked. Its spoken label is "Complete <title>". Below iOS 17, with an older web app and while locked, the row is drawn as today, without a circle.
- **The Android contract, unchanged.** A tap hides the row at once and drops the header's counts by the rows hidden. The tick is queued as Android queues it (`<id>`, or `<id>@<due>` when the publication lists `complete-on`) and the web app completes the task as its own operation in a hidden, background run of the app at `/?complete=<id>&complete=…`, the address of the shared fixture `actions.json` `completePaths`. The shell writes no task data. The web app is not changed: it already applies that address in a background run only.
- **When the run happens.** iOS cannot start the app from a widget, so the queue is handed to the web app the next time the app runs: when it is opened (a hidden run beside the visible app) or at its hourly background refresh. A row stays hidden while its tick waits in the queue, and reappears when no publication confirms it within 30 minutes of the run that took it.
- **The shared fixtures pin it.** The iOS tests read `widget.json`, `widget-locked.json` and `widget-signed-out.json` for `canComplete` and `canCompleteOn`, and build every `completePaths` address of `actions.json`.
- Strings in `Shared/Localizable.xcstrings` in every shipped language.

## Out of scope

- An Upcoming or calendar widget on iPhone, and completing from the Completed widget.
- Applying a tick without the app running at all (iOS gives a widget no way to run the web app).
- Any web app or server change.

ROADMAP: advances the iOS widgets of `apple-shortcuts` and the iPhone app's parity with the Android widgets (#1240); it adds no row of its own.

No new environment variable, no op log change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `native-shells`: a requirement for completing a task from the iPhone Today widget.

## Impact

`mobile/ios` only: `WidgetPublication.swift` (the publication's `actions` and `due`, the hidden rows, the queue and its address), `OpenTodoWidget/TodayWidget.swift` (the circle and its App Intent, the hidden rows, the counts), `BackgroundRefresh.swift` (a hidden run at an address, the queue on opening and in the hourly refresh), `AppDelegate.swift`, `AppModel.forgetServer`, strings and tests.

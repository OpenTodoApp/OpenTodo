# Proposal

## Why

The Android app has a Completed widget beside Today (requirement "Completed widget"): today's completions and a bar per day for the last 7 days. The requirement left the iPhone app's widget as a follow-up (#1683), and the owner asked for it, the same as Android's.

## What Changes

- **A Completed widget in the iPhone app's widget extension, beside Today.** It shows the number completed today, seven bars oldest first scaled to the busiest day with a weekday letter under each, read aloud as each weekday and its count, and the time of the last update. A tap opens Statistics (`opentodo://stats`, which the app opens at `/stats`).
- **The same data as on Android.** It reads the `completed` part of the `publishWidget` payload the app already stores for the Today widget. Nothing new is published and no request is made. A locked account's publication has today's count alone, which the widget shows with "Locked: today's count only" and no bars. A publication without completions asks the person to open the app.
- **One model, the Android rule:** `WidgetPublication.Completed.parse` keeps only well-formed days, counts of zero or more, and the last 7 days, as `CompletedModel.parse` does. The tests read the shared bridge fixtures `widget-completed.json` and `widget-completed-locked.json`, plus the cases of Android's `CompletedModelTest`.
- Strings in `Shared/Localizable.xcstrings`, translated as Android's.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `native-shells`: "Completed widget" covers the iPhone app too.

## Impact

`mobile/ios` only: `WidgetPublication.swift` (the model, and a reload of both widgets on publish), `OpenTodoWidget/CompletedWidget.swift` (new) and the widget bundle, `AppModel` (the `stats` link), strings and the Xcode project. No web, server or synced-data change.

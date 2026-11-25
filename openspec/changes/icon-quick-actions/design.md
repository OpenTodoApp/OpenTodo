# Design

## Context

- Android declares one static shortcut in `res/xml/shortcuts.xml` (`app.opentodo.CHANGE_SERVER`). `MainActivity.handle` already opens any `opentodo-open:<path>` intent at that path of the server; the widgets and notifications use it (`/today`, `/?add=`).
- iOS declares one `UIApplicationShortcutItems` entry in `project.yml` and `Info.plist`, handled in `AppDelegate.application(_:performActionFor:)`. `AppModel.handle(url:)` maps `opentodo://add` to `/?add=`; `ShellView` opens `pendingPath` when it changes.

## Decisions

### D1. Static shortcuts, translated through resources

Both platforms translate static shortcut labels themselves: Android through `@string` resources, iOS through `InfoPlist.strings`, where the key is the title itself. Dynamic shortcuts would need code at every start and a refresh on a language change, for no gain with two fixed actions. Static ones also work before the first start: the action then waits for the first-run screen, like a share.

### D2. The existing deep links, nothing new for the web app

Android's shortcuts are `ACTION_VIEW` intents with `opentodo-open:/?add=` and `opentodo-open:/today`, the addresses the widgets open, so `MainActivity.handle` needs no change. iOS maps the shortcut types `add-task` and `today` to `opentodo://add` and `opentodo://today` and passes them to `AppModel.handle(url:)`, which gains the `today` host (an Open Today intent of `apple-shortcuts` can reuse it). The web app already handles both paths.

### D3. Order: Add task, Today, Change server

The common actions first, the rare and destructive one last. Change server keeps its confirmation on both platforms. Labels: "Add task" is the name of the add button everywhere in the app (`app-shell`), and the quick-add widget's label already carries it in every language; "Today" is the view's name.

### D4. iOS: a scene delegate for quick actions

A SwiftUI app runs in scenes, and UIKit delivers a quick action to the scene delegate (`windowScene(_:performActionFor:)`, or `connectionOptions.shortcutItem` at a cold start), not to the app delegate. `AppDelegate.application(_:configurationForConnecting:options:)` returns a configuration with a small `QuickActionSceneDelegate` and hands the cold start's item to the model. A path set before `ShellView` appeared was not opened either, because `onChange` does not fire for the first value: `ShellView` now loads that path as its first page. When that first load fails offline, the portable build falls back to its cached start page (#1458), as before; the path is not kept, because the cache holds the start page's address only.

### D5. Android launches a static shortcut with a cleared task

The system starts a static shortcut's intent with `FLAG_ACTIVITY_CLEAR_TASK`, so the activity is created again and the page loads from the shell's stored copy. That is how Change server has always worked, and the first frame comes from the stored shell, so it stays quick. A dynamic shortcut could avoid it, at the cost of D1.

## Interface budget

No screen of the web app changes.

## Data model, size, memory

No data change, no op, nothing that syncs. Two vector icons on Android (under 2 KB); no dependency.

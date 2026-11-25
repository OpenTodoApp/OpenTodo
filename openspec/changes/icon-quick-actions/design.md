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

The common actions first, the rare and destructive one last. Change server keeps its confirmation on both platforms. Labels: "Add task" is the name of the add button everywhere in the app (`app-shell`), and the quick-add widget's label already carries it in every language; "Today" is the view's name. Android reuses the widgets' strings (`widget_quick_add_label`, `widget_today`) as short and long label; "Add task" and "Today" fit the short label's ten characters, a longer translation is the launcher's to shorten.

### D4. iOS: a scene delegate for quick actions

A SwiftUI app runs in scenes, and UIKit delivers a quick action to the scene delegate, not to the app delegate. `AppDelegate.application(_:configurationForConnecting:options:)` gives window scenes (and only those) a small `QuickActionSceneDelegate`. The cold start's item is read in its `scene(_:willConnectTo:options:)` from `connectionOptions.shortcutItem`, as in Apple's sample, because a restored scene session connects without asking for a configuration; a later one arrives in `windowScene(_:performActionFor:)`.

A path set before `ShellView` appeared was not opened either, because `onChange` does not fire for the first value: `ShellView` now loads that path as its first page. When that first load fails offline, the portable build falls back to its cached start page (#1458), as before; the path is not kept, because the cache holds the start page's address only.

At a cold start, Change server's dialog waits for `AppModel.windowReady()`, which `StatusBarInstaller` calls once `StatusBar.install` has replaced the window's root: a dialog presented before would belong to the root that is replaced. Without a server (`origin == nil`) Change server does nothing; the first-run screen is already up.

### D5. Android: a trampoline keeps the running app

The system starts a static shortcut's intent with `FLAG_ACTIVITY_NEW_TASK | FLAG_ACTIVITY_CLEAR_TASK`. Aimed at `MainActivity`, that recreates a running app and loses an open sheet or a sign-in in progress. So every shortcut targets `ShortcutActivity`: not exported (the launcher starts shortcuts as the app), no display, no history, its own task affinity. It hands `opentodo-open:` and Change server, and nothing else (`Shortcut.forwards`), to the singleTask `MainActivity`, which gets them in `onNewIntent` when it runs, and finishes. A dynamic shortcut could set its own flags, at the cost of D1.

After the first-run screen `MainActivity` replays its launch intent; a Change server intent is dropped there, since the change it asked for is done (or there was no server to change), so the confirmation does not come back.

## Interface budget

No screen of the web app changes.

## Data model, size, memory

No data change, no op, nothing that syncs. Two vector icons on Android (under 2 KB); no dependency.

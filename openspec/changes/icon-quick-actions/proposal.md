# Proposal

## Why

Long-pressing the app icon offers one action on Android and on iPhone: **Change server** (GitHub issue [#2041](https://github.com/OpenTodoApp/OpenTodo/issues/2041)). The icon menu is the quickest way into an app, and in a task manager the two things people open it for are adding a task and checking Today. Change server is rarely needed after setup.

## What Changes

- **Two quick actions on the app icon, on Android and iPhone: Add task and Today.** Add task opens quick add (the web app's `/?add=`, as the quick-add widget does); Today opens the Today list (`/today`, as the Today widget's header does). Both go through the shells' existing deep-link handling (`opentodo-open:` on Android, `opentodo://` on iOS), so nothing new reaches the web app.
- **Change server stays, as the last item.** It is the only way back to the first-run screen, and nothing in the web app's Settings opens it yet, so removing it from the menu would strand people. Moving it into Settings is left to a follow-up (see Out of scope).
- **The labels are translated** in every language the shells ship, the iPhone's three titles included (Change server was English only there).
- **A quick action at a cold start on iPhone opens its screen.** The SwiftUI app had no scene delegate, so a quick action that launched the app was not delivered, and a path set before the window showed was not opened.

Not **BREAKING**. No new environment variable, no op, no bridge change.

## Out of scope

- Moving Change server into the web app's Settings. It needs a bridge method (the shell owns the server address and its data) and a row in Settings → About; a follow-up change can add it and then drop the menu item.
- Dynamic or pinned shortcuts (a project, a filter). The two actions are static, so they work before the first start and need no code at launch.
- Android App Actions, Quick Settings tiles, Siri and App Intents (`apple-shortcuts`).

ROADMAP item advanced: "Shells that feel native".

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `native-shells`: a requirement for the quick actions on the app icon.

## Impact

- Android: `res/xml/shortcuts.xml`, two strings in every `values*/strings.xml`, two icons.
- iOS: `Info.plist` and `project.yml` (`UIApplicationShortcutItems`), `InfoPlist.xcstrings`, `AppDelegate.swift` (a scene delegate), `AppModel.swift` (`perform(shortcut:)`, `opentodo://today`), `ShellView.swift` (a path waiting at the first load).
- Docs: `docs/android-app.md`, `docs/ios-app.md`. Checks: `scripts/repo-checks.test.mjs`.

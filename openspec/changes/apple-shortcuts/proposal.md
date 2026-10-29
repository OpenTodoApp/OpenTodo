# Proposal

## Why

On an iPhone, capture happens away from the app. People use Siri while walking, the Action Button, the lock screen, and the Shortcuts app. A web app can reach none of these (research §3.1: "an iOS PWA cannot register Home Screen or Lock Screen Widgets, Siri / Apple Shortcuts (AppIntents)…"). Users of self-hosted competitors end up writing their own Scriptable widgets and `shortcuts://` hacks (research §3.1, ref. 29). #105 asks for exactly this: "widgets and reminders … would be very useful in my workflow".

OpenTodo's iOS app (`ios-shell`, published by `ios-distribution`) is the place where this can live. People who stay on the installed web app need a smaller version of the same thing: a ready-made Shortcut that captures into their server.

## What Changes

- **App Intents in the iOS app.** Four actions:
  - **Add task**: takes text, which Siri can dictate.
  - **Open quick add**.
  - **Open Today**.
  - **What's on today**: answers from the last Today list the app published, without a network request.

  Each one is offered as an App Shortcut with a Siri phrase in the six languages. Any of them can be put on the Action Button or the lock screen, or used inside the user's own Shortcuts.
- **Captures queue on the phone and the web app files them.** "Add task" never calls the server from Swift. It writes the text into a small queue in the app's shared container. The web app takes the queue through a new bridge capability, `capture`, and files each line with its own quick-add parser through the operation log. This works offline and on encrypted accounts, and it converges like any other edit. The app tries to file the line at once with a short hidden run. Otherwise the line is filed the next time the app runs.
- **More widgets on iOS.** A small quick-add widget (one button that opens quick add). Lock-screen widgets: today's count, the next tasks, and an "Add" button. On iOS 18 and later, an "Add task" control for Control Center and the Action Button. All of them read only the data the web app already publishes, as the Today widget does.
- **A Shortcuts pack for the web app.** It is published with each release, so people without the iOS app get it too:
  - **Add to OpenTodo** has two modes, like the browser extension. "Capture screen" needs no token and opens the server's capture screen. "Quick save" uses a `full` token kept in the Shortcut, parses the line on the server and creates the task.
  - **OpenTodo Today** opens the Today list.

  The pack is documented in `docs/apple-shortcuts.md`.

Not **BREAKING**. No new environment variable. Bridge version 1 gains one capability. Older shells and older web apps keep working, because a capability nobody lists is never used.

## Out of scope

- Live Activities and the Dynamic Island for Focus: `focus-live-activity`.
- Apple Watch complications and a watch app.
- A Scriptable widget (it is a third-party app; the native widgets cover the need).
- Intents that edit, complete or search existing tasks. They would need the app to answer from the encrypted local store in the background, and they enlarge the bridge. A later change can add them once the capture path has proven itself.
- Android App Actions and Android Quick Settings tiles.
- A new token scope just for capture. The pack reuses the browser extension's model: a `full` token per device, or no token at all (design D6).

ROADMAP item advanced: "Next: Native shells" (iOS) and milestone 0.20 "Everywhere" of the 1.0 plan.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `native-shells`: Siri and Shortcuts actions, the on-device capture queue and its bridge capability, and the iOS quick-add and lock-screen widgets. The "Widgets" delta is written against the text after `ios-shell` is archived, which `ios-distribution` does first.
- `share-capture`: the published Apple Shortcuts pack for people using the web app.

## Impact

- **Data model, sync, op schema:** no new field. A capture becomes an ordinary task created through `mutate()` (task id = the capture's id), so it is offline-first and convergent. Nothing new is synced.
- **E2EE:** the web app files captures only while the account is unlocked, so titles are encrypted on the device as with any other edit. Until then the text waits in the app's shared container, protected by iOS Data Protection, and never leaves the phone in clear. "What's on today" and the lock-screen widgets follow the existing widget rules: titles only from an unlocked publication, counts only when the account is locked, and titles hidden on a locked phone.
- **API, CLI, MCP:** none. The Shortcuts pack uses the existing `POST /api/v1/quick-add/parse` and `POST /api/v1/tasks`.
- **CalDAV, vault:** none.
- **Web bundle:** one small module (`shellCaptures.ts`, under 2 KB gzip, checked against `web/bundle-budget.json`). **Server binary:** unchanged. **iOS app:** App Intents and WidgetKit are system frameworks, so no dependency; the app grows by an estimated 150 KB.

Relates to #105

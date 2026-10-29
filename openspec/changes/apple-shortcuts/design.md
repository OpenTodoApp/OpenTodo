# Design

## Context

The iOS shell (`ios-shell`) loads the web app in a `WKWebView` and adds what a browser cannot do through bridge version 1 (`web/src/lib/shell.ts`). The capabilities are `reminders`, `share`, `widgets`, `biometric` and `links`. It already has:
- a Today widget drawn from the JSON the web app publishes (`publishWidget`, `web/src/lib/shellPublish.ts`);
- a hidden web view run (`HiddenRun` in `BackgroundRefresh.swift`) that loads the web app for at most 30 seconds;
- the quick-add address `/?add=<text>` that the Android quick-add widget already uses (`web/src/lib/shellActions.ts`).

ios-shell D3 rejected a native REST client in the shell: it would be a second API client and a second credential, and it would bypass the web app's encryption. This change keeps that rule.

## Goals / Non-Goals

**Goals:**
- Hands-free capture with Siri, the Action Button and the lock screen, working offline and on encrypted accounts.
- Read-only glances (count, next tasks) without opening the app.
- Capture from Shortcuts for people who only use the installed web app.

**Non-Goals:**
- Editing or completing tasks from Siri, a watch app, Android App Actions, a capture token scope.

## Decisions

**D1. A capture is queued in the shell and filed by the web app.**
"Add task" appends an entry `{id, text, createdAt, source}` to `capture-queue.json` in the App Group container (file protection `complete`):
- `id` is a new UUID.
- `text` is trimmed and at most 500 characters, the same cap as `/?add=`.
- `source` is `siri`, `shortcut`, `widget` or `control`.

The web app files each entry when it can read the queue (D3): it runs the line through the quick-add parser in the account's languages and creates the task through `mutate()` with **the capture's id as the task id**. Then it acknowledges the ids, and the shell removes them.

- **Exactly once.** If the web app stops between the create and the acknowledgement, the next run finds a task with that id in the local store, skips the create and only acknowledges. Two devices never share a queue, so there is nothing to converge beyond the ordinary create op.
- **Offline.** The create goes into the outbox like any edit and syncs later.
- **Encrypted accounts.** The web app files only while the account is unlocked on the device, so the title is encrypted by `mutate()` as usual. While the account is locked the entries wait in the container and never leave the phone in clear.
- **Limits.** At most 50 entries wait at once. A 51st "Add task" answers that the queue is full and asks the user to open the app, and nothing is dropped silently. Entries never expire, because they are the user's words.
- **Server change and sign-out.** The queue is deleted together with the rest of the shell's data when the server is changed (`AppModel.forgetServer`). On sign-out, the web app's sign-out confirmation says "N captures from Siri have not been added yet" when the queue is not empty, and signing out deletes them, as it deletes the reminder schedule and the widget data. Otherwise the next account to sign in would receive another person's captures.

Alternatives considered:
- **A native REST call with a token kept in the Keychain.** This was ios-shell D3's rejected option. It needs a second credential, it cannot encrypt for an encrypted account, and it fails offline.
- **Opening the app on every Siri request** (`openAppWhenRun`). That is not hands-free: the phone unlocks and the screen changes while the user is walking or driving.
- **An App Intent that writes into the web app's IndexedDB directly.** That storage belongs to WebKit and has no supported native access.

**D2. Filing happens at once when it can, later otherwise.**
App Intents defined in the app target run in the app's process. iOS starts the app in the background when needed. After queueing, the intent asks `HiddenRun` to load the web app and waits up to 8 seconds for the acknowledgement:
- Filed in time: Siri says "Added to OpenTodo."
- Not filed in time (no network for the page load in the portable build, a slow phone, a locked encrypted account): Siri says "Saved on this iPhone. OpenTodo adds it the next time the app runs." When the last widget publication was `locked`, it says "… once you unlock OpenTodo."

The queue is also drained whenever the app comes to the front and during each background refresh. In the portable build the hidden run needs the network to load the page (ios-shell D2). That is why the queue exists at all: nothing is lost while the server is unreachable.

**D3. The bridge capability `capture`.**
It is added to bridge version 1. The version is not bumped, because capabilities already gate methods (native-shells "The bridge is optional and versioned"). It has two methods:
- `readCaptures(): string`: the JSON array of waiting entries, at most 50.
- `ackCaptures(json: string)`: the ids that were filed or found filed.

The web app reads the queue on start, when it becomes visible, and once after each sync while the shell lists `capture`. A browser, the Android shell and an older iOS shell never list it, so nothing changes there. The payloads go into the shared bridge fixtures (`native-shells` "Shared bridge fixtures"), so the web and Swift tests read the same files.

**D4. The intents and their phrases.**

| Intent | Opens the app | What it does |
|---|---|---|
| Add task (`text`, requested by Siri when missing) | no | D1, D2 |
| Open quick add | yes | opens `/?add=` (empty) |
| Open Today | yes | opens `/today` |
| What's on today | no | answers from the last widget publication: the count, the overdue count and up to 5 titles with their times, plus "as of 09:12". When the publication is `locked` it gives counts only. With no publication yet: "Open OpenTodo once to see today here." |

Every intent is an App Shortcut with one or two phrases that contain the app name (an `AppShortcutsProvider` requirement), localised in en, de, fr, es, it and pt in `AppShortcuts.xcstrings`. Example: "Add a task in OpenTodo" and "Füge in OpenTodo eine Aufgabe hinzu". The Action Button and the iOS 18 controls can run any App Shortcut, so neither needs its own code beyond D5.

**D5. Widgets: a quick-add button, lock-screen accessories, a control.**
WidgetKit has no text field (ios-shell D8), but a widget can be a button that opens the app:
- **Quick add (systemSmall):** a "+ Add task" button. The URL is `opentodo://add`, which the shell maps to `/?add=`, the same route as Android's widget button.
- **Lock screen:**
  - `accessoryCircular`: today's count, with a dot when anything is overdue;
  - `accessoryRectangular`: the next two or three tasks with their time;
  - `accessoryInline`: "3 tasks today · 1 overdue";
  - a second `accessoryCircular` that is an "Add" button.
- **Control (iOS 18+ only, `ControlWidgetButton`):** "Add task", which opens quick add. On iOS 16.4 to 17 it does not exist and nothing else changes.

All of them read the same published JSON as the Today widget and follow its rules: titles only from an unlocked publication, counts only for a locked account, and the update time shown where there is room. Titles on the lock screen are marked `privacySensitive()`, so iOS hides them while the phone is locked, unless the user allowed lock-screen widget data in iOS settings. The widgets never make a request.

**D6. The Shortcuts pack reuses the browser extension's two modes.**
Two Shortcuts, built from plist sources in `mobile/shortcuts/` and signed for distribution (`shortcuts sign --mode anyone`) on the macOS CI runner on final tags. They are attached to the release and linked from the docs.
- **Add to OpenTodo.** It asks for text (dictation works) and runs in one of two modes, chosen when the Shortcut is imported:
  - *Capture screen* (default, no token): opens `https://<server>/share?title=<text>` in Safari or the installed web app, where the text fills the quick-add style title field. The user saves there, and an encrypted account encrypts on the device.
  - *Quick save* (a `full` token, as the extension's Quick save): first reads `GET /api/v1/me`. When `encryption.enabled` is true it uses the capture screen instead, because the server accepts a plaintext REST write for an encrypted account and encrypts it only later (`end-to-end-encryption`), and a phone capture must not put a readable title into the log. Otherwise it calls `POST /api/v1/quick-add/parse`, then `POST /api/v1/tasks` with the parsed fields, and shows "Saved". On 401, 403 or no answer within 10 seconds, it falls back to the capture screen with the same text and says why.
- **OpenTodo Today.** Opens `https://<server>/today`.

Import questions ask for the server address and, for Quick save, the token. The docs tell the user to create a dedicated token named "iPhone Shortcuts" so it can be revoked alone, and never to use an `admin` token. The Shortcut talks only to the address the user typed.

Rejected: a new `capture` token scope. It would be a new scope in AGENTS rule 4, a new side table and new policy code for a convenience that the capture screen already offers without any token. Also rejected: an `agent` token. History would label the task "AI assistant" and it depends on the AI switches.

If CI cannot sign Shortcuts (the command needs a signed-in macOS user), the owner signs them by hand on release and attaches them. Task 5.3 records which way works.

## Data model impact

None. No op field, no route, no migration. A capture is an ordinary task create (op schema unchanged). The shell stores `capture-queue.json` in its App Group container. It is never synced, exported or sent anywhere except as the web app's task create.

## Size

- iOS app: about 150 KB more (intents, widget views, string catalog). App Intents and WidgetKit are system frameworks.
- Web app: `shellCaptures.ts` and the sign-out notice, under 2 KB gzip.
- Server: unchanged.

## Interface budget and progressive disclosure

Nothing new appears in the web app for anyone not using the iOS app. In the iOS app the only visible web-app change is one sentence in the sign-out confirmation, shown only when captures are waiting. No sidebar destination, list chrome, task property or shortcut is added. The widgets and intents live in iOS (the widget gallery, Shortcuts, Settings ▸ Action Button), where the user adds them on purpose. Simple-list users see nothing new.

## Risks

- **Late filing in the portable build.** A capture made offline is filed once the app can load. Siri says so, and the docs explain it.
- **Siri phrase quality per language.** The phrases are reviewed by the same translators as the web app (docs/translating.md).
- **Shortcut signing in CI** may not work headless (D6). There is a manual fallback.

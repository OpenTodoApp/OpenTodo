## ADDED Requirements

### Requirement: A native app that shares the protocol code
OpenTodo SHALL provide a phone app, built with React Native, in `mobile/app/`. It SHALL draw its screens with the platform's own views (navigation stack, tab bar, sheets, menus, lists). It SHALL use the web app's shared modules in `web/src/lib` for sync, ops, the hybrid clock, encryption, dates, recurrence and quick add, and SHALL NOT carry a second implementation of any of them. Its dependencies SHALL be pinned exactly and listed with a reason in `mobile/app/DEPENDENCIES.md`. It SHALL add nothing to the web app's bundle or the server binary.

#### Scenario: Same protocol code
- **WHEN** a change alters how a shared module merges a field
- **THEN** the web app and the app both run the changed module, and the shared vectors fail in both if the change breaks convergence

#### Scenario: Dependency without a reason
- **WHEN** a pull request adds a package to `mobile/app/package.json` without a line in `DEPENDENCIES.md`
- **THEN** the repository check fails naming the package

### Requirement: Declared shared-code boundary
The app SHALL import shared code only through modules listed in `mobile/app/shared-modules.json`. The list SHALL be generated from the app's import graph, and the repository check SHALL fail when the list is stale. A listed module SHALL NOT use a browser-only global (`window`, `document`, `navigator`, `localStorage`, `BroadcastChannel`, `indexedDB`) other than through the platform port. The app SHALL NOT import from `web/src/app` or `web/src/ui`.

#### Scenario: New browser global in a shared module
- **WHEN** a change makes `sync.ts` read `document.hidden` directly
- **THEN** the boundary check fails naming the module and the global, and suggests the platform port

#### Scenario: App imports a web screen
- **WHEN** an app module imports from `web/src/app/`
- **THEN** the app's lint fails

### Requirement: Platform port
Shared modules SHALL reach their host only through `web/src/lib/platform.ts`: visibility, network state, a leader lock, an optional broadcast channel, a small preferences store and time-zone changes. The web app's implementation SHALL behave exactly as before the port, and the app SHALL provide its own implementation at start-up.

#### Scenario: Web behaviour unchanged
- **WHEN** the port lands
- **THEN** the full web test suite, the layout checks and the 10,000-task count checks pass without changes to their expectations

#### Scenario: App comes to the foreground
- **WHEN** the app returns to the foreground after an hour in the background
- **THEN** the port reports it visible, sync pulls at once and the live stream reopens

### Requirement: Local data on the phone
The app SHALL keep the account's data in a SQLite database on the device, behind the same database interface the shared modules use. It SHALL work fully offline: lists, capture and completion work without a network, and ops wait in the outbox. A committed write SHALL survive the app being killed. The database SHALL belong to one account on one server and SHALL be deleted when the user signs out.

#### Scenario: Offline completion
- **WHEN** the user completes a task in airplane mode and later reconnects
- **THEN** the task stays completed throughout, the op is sent on reconnect, and the web app shows it completed

#### Scenario: Killed after a write
- **WHEN** the system kills the app right after a task is added
- **THEN** the task is there on the next launch and is still sent

#### Scenario: Concurrent edits converge
- **WHEN** the same task's title is changed offline in the app and on the web, and both reconnect
- **THEN** both show the same title, chosen by the hybrid clock as for any two devices

#### Scenario: Sign-out
- **WHEN** the user signs out in the app
- **THEN** the database, the tokens and the device settings of that account are deleted from the phone

### Requirement: Sync in the app
The app SHALL sync with the shared engine: outbox, pull pages, the live stream and the hybrid clock, under its own device id. It SHALL pull when it comes to the foreground and SHALL close the live stream after its outbox drains when it goes to the background. Sync errors SHALL appear in the app's own status, never as a web page.

#### Scenario: Change from the web
- **WHEN** a task is renamed on the web while the app is open in the foreground
- **THEN** the app shows the new title within the live-sync budget, without a reload

#### Scenario: Server unreachable
- **WHEN** the server cannot be reached
- **THEN** the app keeps working from local data and its status says it is offline, with the time of the last sync

### Requirement: Server compatibility
The app SHALL read the server's version before sign-in and SHALL refuse, with a message naming the minimum version and a link to the update guide, a server without the app sign-in routes. It SHALL NOT fall back to showing the web app.

#### Scenario: Old server
- **WHEN** the user enters the address of a server older than the app's minimum
- **THEN** the app explains that the server must be updated and does not open a sign-in

#### Scenario: No server at the address
- **WHEN** the address does not answer as an OpenTodo server
- **THEN** the app says so beside the address field and keeps it for correction

### Requirement: Lean continuous integration for the app
CI SHALL run the app's checks only for changes that can affect it. A Linux job SHALL type-check, lint and unit-test the app when `mobile/app/`, a module in `shared-modules.json`, the op schema or the app's catalogs change. Mac and Android builds SHALL run only for changes under `mobile/app/`, nightly and for releases. A change that touches none of these SHALL run no app job, and no web job SHALL install the app's dependencies.

#### Scenario: Web-only change
- **WHEN** a pull request changes only `web/src/app/today/TodayView.tsx`
- **THEN** no app job runs and the web jobs run exactly as before this change

#### Scenario: Shared module change
- **WHEN** a pull request changes `web/src/lib/recurrence.ts`
- **THEN** `app-check` runs on Linux and no Mac or Android build runs

#### Scenario: App change
- **WHEN** a pull request changes a file in `mobile/app/`
- **THEN** `app-check`, `app-ios` and `app-android` run

### Requirement: TestFlight distribution
The app SHALL be published to TestFlight under the existing OpenTodo App Store record (bundle id `app.open-todo.ios`), as version 2.0.0, and SHALL NOT be released on the App Store by this change. On Android it SHALL use the current app's application id, `app.opentodo`. Builds SHALL be made, signed and uploaded by the repository's CI with the release environment's key. No build SHALL be submitted for review by CI.

#### Scenario: A tester installs the trial
- **WHEN** a tester with the current OpenTodo app accepts the TestFlight invitation and installs version 2.0.0
- **THEN** the native app replaces the shell on that device, and people who did not join TestFlight keep the App Store version


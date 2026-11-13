# Proposal

> **Paused (2026-11-13).** The owner decided to stay with the web-view shells and make them feel native instead; the audit and plan are in [`mobile/AUDIT.md`](../../../mobile/AUDIT.md). The code in `mobile/app/` and the app sign-in on the server stay as they are. Nothing here is scheduled; open tasks stay open until the work resumes or the change is withdrawn.

## Why

The iPhone app (`ios-shell`, `ios-distribution`) is the web app inside a web view. People who tried it are disappointed. Scrolling, navigation, sheets, the keyboard and gestures all behave like a website. On a phone that is the difference between an app people keep and one they delete, and a second disappointment would cost more than the first. The Android app is the same kind of shell and has the same ceiling.

Making the shell better cannot fix this. What people notice is lists that scroll and bounce like UIKit, a navigation stack with the edge-swipe back, sheets with detents, swipe actions, haptics, and a keyboard that never covers the field. A page in a web view cannot have them.

OpenTodo's sync, op log, encryption, dates, recurrence and quick-add parser are plain TypeScript in `web/src/lib`, pinned by shared vectors. An app written in React Native can run that code unchanged and draw every screen with the platform's own views. Only the screens are new work, and the protocol stays one implementation.

This change lays the foundation and ships a **trial build** next to the current app, so the owner and testers can compare the two before anything is retired:

- the app's place in the repo;
- the boundary that lets it import the shared code;
- local storage on the phone;
- sign-in through the system browser;
- sync running;
- CI lanes that leave the web app's pipeline as fast as it is today;
- a TestFlight preview.

The screens people use every day are `native-app-everyday`. Widgets, share, reminders, encryption unlock, Android and retiring the web-view shells are `native-app-handover`.

## What Changes

- A React Native app (Expo, New Architecture) in `mobile/app/`, with its own `package.json` and lockfile. It never adds a byte to the web app's bundle or to the server binary.
- **A shared-code boundary.** The app imports `web/src/lib` only through a declared list of platform-neutral modules (`mobile/app/shared-modules.json`). A check refuses an import outside the list, and refuses a listed module that reaches a browser-only API without going through the platform port.
- **A platform port in `web/src/lib`.**
  - It is a small interface for what the shared code asks of its host: app visibility and focus, online and offline, a leader lock, a key-value store for device settings, and a secure store.
  - The web app's implementation is today's behaviour, moved behind the interface. Nothing in the web app changes for users.
- **Local storage on the phone** in SQLite, holding the same tables the web app keeps in IndexedDB. The data layer's database calls are unchanged. The design picks the adapter and the measurement that decides it.
- **App sign-in through the system browser.**
  - The app opens the user's own server's sign-in page in the system's authentication sheet. Password, second factor, passkeys and single sign-on all work there exactly as on the web, with no second implementation.
  - The server hands the app a one-time code through `opentodo://`. The app exchanges it, with PKCE, for an app session that the user sees and can revoke with their other sessions.
  - This is a new, small server feature built on the OAuth server that already exists (`internal/mcpoauth`).
- **Sync** runs in the app with the shared engine: the outbox, pull pages, the live stream, the hybrid clock and conflict-free merges, the same as a browser tab.
- **CI lanes:**
  - One Linux job checks the app (type-check, lint, unit tests) when the app or a shared module it imports changes. It takes about two minutes and needs no Mac.
  - Mac and Android builds run only when the app itself changes, every night, and when a release is cut.
  - A web-only pull request runs exactly the jobs it runs today.
- **A trial build in TestFlight:**
  - It ships under the existing App Store record (`app.open-todo.ios`) as version 2.0.0, on TestFlight only (owner decision, 2026-11-10): a tester gets it in place of the shell, everyone else keeps the App Store version.
  - It is built by the existing TestFlight workflow on GitHub's Mac runners, with no Xcode on anyone's machine.
- A minimal first screen to prove the foundation end to end: sign in, sync, see Today, and complete a task with the change reaching the web app.

## Capabilities

### New Capabilities

- `native-app`: the React Native app. This change covers its place in the repo, the shared-code boundary and platform port, local storage, sign-in, sync, its CI lanes and its preview distribution.

### Modified Capabilities

- `account-access`: app sign-in through the system browser with an authorization code and PKCE; app sessions listed and revocable with the user's other sessions.
- `performance-budgets`: budgets for the app at 10,000 tasks, measured on the simulator every night.

## Impact

- **New code:** `mobile/app/`, the TypeScript app.
- **Shared code:**
  - `web/src/lib/platform.ts`, the port, with the web implementation.
  - Small edits where `sync.ts`, `ops.ts`, `http.ts`, `dates.ts` and `crypto.ts` touch `window`, `document`, `navigator`, `BroadcastChannel`, `localStorage` or `crypto.subtle` directly.
- **Server:**
  - a built-in public client for the app in `internal/mcpoauth`;
  - the `app` scope on its grants;
  - two routes: the sign-in hand-off page and the code exchange;
  - app grants shown in the sessions list.
- **CI:** `scripts/ci-changes.sh` gains the `app` answer, computed from `shared-modules.json`, and `.github/workflows/ci.yml` gains `app-check`. A nightly job builds the app and runs its simulator tests.
- **Owner actions:** none for the trial: the App Store record and the bundle id exist (design D10). The existing `release` environment's key signs and uploads.
- **No new mandatory environment variable and no change to the op log.** The app writes ops through the same `mutate()` path with its own device id. Older servers that lack the app sign-in routes are refused with a clear message, never half-supported.

## Out of scope

- The everyday screens beyond Today: `native-app-everyday`.
- Widgets, the share extension, device reminders, biometric unlock of an encrypted account, Siri and Shortcuts, Android release, and retiring the web-view shells: `native-app-handover` and `apple-shortcuts`.
- An iPad layout. The trial build is iPhone-only, and iPad follows once the phone design holds.
- Editing a note's rich document natively. Notes open read-only, with editing in `native-app-everyday`.
- EAS or any other hosted build service. Builds stay on the repo's own CI.

## Roadmap

Adds a "Native app" area to `ROADMAP.md` with the three changes, in order: `native-app-foundation`, `native-app-everyday`, `native-app-handover`. It advances `ios-distribution` (#600) and `play-production` (#603), which then ship the native app instead of the shell.

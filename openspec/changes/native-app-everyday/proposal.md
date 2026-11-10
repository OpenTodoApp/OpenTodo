# Proposal

## Why

`native-app-foundation` gives the app sync, storage and sign-in. This change gives it the screens people use many times a day. It designs them for a phone from the start rather than porting the web app's layouts.

Testers rejected an app that looked like the website. The bar is an app that sits comfortably next to Reminders, Things and Linear's mobile app:

- a tab bar;
- large titles that collapse;
- swipe to complete;
- long-press menus;
- sheets that follow your finger;
- capture that is open and typing within a moment.

## What Changes

- **Tabs:** Today, Inbox, Upcoming, Browse and Search, in the platform's tab bar.
- **Lists:**
  - native recycled lists with large collapsing titles and pull to sync;
  - swipe right to complete, swipe left to schedule or delete;
  - long-press for a context menu with a preview, and long-press drag to reorder where order is manual;
  - a completion that lingers for a moment with a haptic before the row folds away.
- **Capture:**
  - one button opens a quick-add sheet with the keyboard already up;
  - the shared quick-add parser highlights dates, projects, labels and priority as you type;
  - a toolbar above the keyboard sets them by tap;
  - Return adds the task and keeps the sheet open for the next one.
- **Task detail** pushed onto the navigation stack:
  - the title and notes are edited in place, with notes as Markdown text that merges into the note's document;
  - grouped rows for When, Deadline, Project, Labels, Priority, Reminders and Repeat, each opening a native picker;
  - subtasks with progress;
  - comments and attachments to read and open.
- **Date picker:** quick choices (Today, Tomorrow, This weekend, Next week, No date), a natural-language line using the shared parser, the system calendar and an optional time.
- **Browse:**
  - projects (with sections as list sections), labels and saved views;
  - Notes: read rendered, edit as Markdown;
  - the Logbook.
- **Search:** tasks and notes on the device, with the shared matching and ranking.
- **Settings in the app:** account, server, appearance, sign out, and an "Open on the web" row for everything configured there. The web opens in Safari, plainly external, never a web view inside the app.
- **Encrypted accounts:** unlock with the passphrase. Biometric unlock is in `native-app-handover`.
- **Android:** the same screens with Material conventions: bottom navigation, a floating add button, and the system back gesture.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `native-app`: navigation, lists and gestures, capture, task detail, pickers, Browse, Search, in-app settings, encrypted-account unlock, accessibility, and the phone interface budget.

## Impact

- Code: `mobile/app/src/` screens and components.
- Shared modules gain only what the screens import. The boundary list grows, and the boundary check keeps them platform-neutral.
- No server change and no op change.
- Tests:
  - Jest component tests;
  - Maestro flows on the simulator;
  - screenshots of every screen in light and dark, uploaded as CI artifacts for review.

## Out of scope

- Calendar and time blocking, boards, timeline, focus mode, the weekly review, Plan and objectives, automations, the assistant, maps and places, the notes graph, theme editing and integrations. They open on the web. Each can come to the app later in its own change, if it suits a phone.
- Widgets, share, device reminders, biometric unlock, iPad and the switch-over: `native-app-handover`.
- Siri and Shortcuts: `apple-shortcuts`.

## Roadmap

Second change of the "Native app" area. It follows `native-app-foundation` and precedes `native-app-handover`.

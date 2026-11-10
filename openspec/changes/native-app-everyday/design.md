# Design

## Context

- **Prerequisites.** The foundation provides storage, sync, sign-in and the UI stack (foundation D7): native stack, native tabs, gesture handler, Reanimated, a recycled list and `@expo/ui`.
- **Reusable logic.** The shared modules already hold what the screens need beyond drawing:
  - `liveTasks`, `inbox`, `flow` and `closedList` decide what each list shows;
  - `nlp/*` parses capture;
  - `recurrence` and `dates` handle dates and recurrence;
  - `ops` and `mutate()` write;
  - `pendingDone` handles the completion grace period;
  - `noteSearch` searches notes;
  - `i18n` provides the strings and the seven languages.
- **What is new.** The screens are new, and they are written for the phone.

## Goals / Non-goals

**Goals**
- Every interaction uses the platform's own control or gesture where one exists.
- Capture is the fastest thing in the app.
- The app is calm: one row of chrome above a list, with no helper text.

**Non-goals**
- Reproducing web layouts.
- Covering planning screens that need a large surface (calendar, boards, Plan).

## Decisions

### D1. Information architecture: five tabs

| Tab | Shows | Why it is a tab |
|---|---|---|
| Today | Today with the closed-list rule and overdue on top (shared `closedList`, `flow`) | The screen opened most |
| Inbox | Unprocessed capture (shared `inbox`), with triage swipes | Capture's destination |
| Upcoming | The next 14 days as list sections, with a week strip under the title | "What's coming" |
| Browse | Projects, Labels, Saved views, Notes, Logbook, Settings | The rest, one level down |
| Search | The platform's search tab (on iOS 26 the tab bar's search role) | Always one tap away |

Alternatives:
- **A sidebar drawer like the web.** Rejected: drawers are not native on iOS and hide where you are.
- **Fewer tabs, with Inbox inside Browse.** Rejected: the Inbox is visited daily and its count belongs on the tab.

The tab bar shows the Inbox count as a badge, and Today's count when the user has turned the app badge on.

### D2. Capture: one button, a sheet, the keyboard up

- **iOS.** The add button is the tab bar's bottom accessory on iOS 26, or a trailing navigation-bar button on earlier versions.
- **Android.** A floating action button, the platform convention.
- **The sheet.** It opens at the medium detent with the field focused. The goal is the keyboard up within 250 ms of the tap, measured by a Maestro flow.
- **Parsing as you type.** Text runs through `nlp/quickadd` on every keystroke. Recognised spans are tinted inline, using the same spans the web app uses, and each has a chip in the toolbar above the keyboard. Tapping a chip edits or removes it.
- **The toolbar** sets the date, project, labels, priority and reminder by tap. Each button opens the same native pickers as the task detail.
- **Return** adds the task with a light haptic, clears the field and keeps the sheet open. Swiping the sheet down closes it.
- **Where tasks go.** A task added from Today gets Today's date unless the text says otherwise. One added from a project goes to that project, and one added from a label carries that label. This is the web's context rule from `createAfter`.

### D3. Lists and gestures

- **Swipes.**
  - A full swipe right completes, with a success haptic. The row stays for the shared grace period with Undo, then folds away.
  - Swipe left shows Schedule (opens the date sheet) and Delete (destructive; undo through the toast).
  - In the Inbox, swipe left shows Schedule and Move instead.
- **Long-press.**
  - Long-press opens a context menu with a preview of the task: Schedule, Move, Priority, Labels, Duplicate, Copy link, Delete.
  - In a manually ordered list, long-press then drag reorders, writing the shared `ordering` rank.
- **Selection.** Edit mode (the navigation bar's Select) gives multi-select with a bottom toolbar: Complete, Schedule, Move, Delete.
- **Rows.** A row shows at most the title, the date or time, the project (outside its own project), and a single icon line for priority, recurrence, subtasks progress and notes. That is four properties, against the web's seven.
- **Sync.** Pull to refresh runs a sync now, with the system refresh control.

### D4. Task detail: pushed, edited in place

- **Opening a task.** Tapping a row pushes the detail onto the stack: an edge swipe goes back, and the title collapses into the bar.
- **Title and notes.**
  - The title is a multi-line field at the top, and the notes field sits below it.
  - Notes are edited as Markdown text. The write goes through the shared path that folds plain text into the note's document (`ops.ts`, collaborative-rich-text), so a note edited on the phone and in the web editor at the same time converges.
  - Formatting the plain text cannot express, such as tables, is shown read-only with "Edit on the web".
- **Fields.** An inset grouped list holds When, Deadline, Project, Labels, Priority, Reminders and Repeat. Empty fields collapse into one "Add…" row, so a fresh task shows only what is set.
- **Below the fields:** subtasks (progress, add, complete, reorder), attachments (open with QuickLook or the system viewer) and comments (read and add).
- **Saving.** Every change writes an op at once. There is no Save button, and a toast offers Undo for destructive changes.

### D5. Pickers

- **Date.** A sheet with quick choices, a natural-language line (shared parser: "next fri 9am"), the system calendar (`@expo/ui` DatePicker) and a time toggle. Recurrence uses the shared `recurrence` presets plus "Custom…", which opens a form for the rule.
- **Project, labels and people.** A searchable native list in a sheet. Labels allow multi-select, and a new item can be created from the search text.
- **Priority.** A native menu with the four names (`priority-names`).

### D6. Visual language

- **System first.** System fonts with Dynamic Type, system background and grouped colours, SF Symbols on iOS and Material Symbols on Android.
- **Accent.** The user's accent comes from their theme preference (synced `user_prefs`), so the app is recognisably theirs. There are no web tokens and no custom-drawn controls.
- **Motion.** The platform's own transitions. Completion uses a short spring on the checkbox, and Reduce Motion replaces it with a fade.
- **Interface budget on the phone:**
  - one row of chrome under the large title, at most (the Upcoming week strip and the Today date line are that row);
  - at most four properties per row;
  - five tabs;
  - no helper text and no taglines.
- **Empty states.** One line and one action, for example "Nothing for today" with Add.

### D7. Encrypted accounts

When the account is encrypted, the app asks for the passphrase after sign-in. It derives the key with the shared `crypto` path (quick-crypto, checked by the vectors) and keeps the unwrapped key in memory only. On a cold start it asks again. Biometric unlock, which keeps a wrapped key in the Keychain, is `native-app-handover`.

### D8. Accessibility

- Every control has a label and a role.
- Swipe actions are also custom accessibility actions on the row, so VoiceOver and TalkBack users reach Complete, Schedule and Delete without gestures.
- Dynamic Type works up to the accessibility sizes, and rows grow rather than truncate the title.
- Colour is never the only signal.
- A Maestro flow runs each screen with the largest text size, and the platforms' accessibility audits run on each screen in `app-ios` (XCUITest audit) and `app-android` (Espresso accessibility checks).

### D9. Testing and review without a Mac

- Jest with React Native Testing Library covers component behaviour on Linux in `app-check`.
- Maestro flows (capture, complete, swipe, schedule, detail edit, offline) run on the iOS simulator in `app-ios` and on an emulator in `app-android` nightly.
- `app-ios` uploads screenshots of every screen in light and dark at the standard and largest text sizes. Reviewers read the artifact.
- Pixel baselines are not used: simulator rendering noise would make them flaky, and the flows assert what matters.

## Data model

None. Every write is an existing op through `mutate()`.

## Size and memory

- No server or web impact.
- The app's growth is its own code. New dependencies are limited to those listed in the foundation's D7.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| **Plain-Markdown note editing loses formatting the document holds.** | Formatting Markdown cannot express is left untouched by the fold-in, and such notes show "Edit on the web" for those parts. Shared tests cover a round trip of every block type. |
| **Scope creep toward web parity.** | Out of scope is explicit. A screen joins the app only through a change of its own. |
| **Gesture conflicts:** swipe actions against the edge-swipe back. | Swipe actions start only beyond the system's edge region, and a Maestro flow checks both gestures. |

## Open Questions

None blocking.

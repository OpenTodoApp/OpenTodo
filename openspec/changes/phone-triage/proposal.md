# Proposal

## Why

The owner wants the whole app comfortable on a phone. Process the Inbox (`/triage`) has the phone header since `phone-all-screens`, but its content was never written for one. Reading the screen and looking at it at 390 px with touch showed:

- The decisions are eleven small buttons (32 px, 44 px by the touch rule) that wrap into three rows directly under the card, each with a key a phone does not have. Their place moves with the length of the task's title and notes, so the thumb has to find them again on every task.
- The floating add button and the reminder toast stand in the same corner as the decisions.
- Move opens a centred dialog that holds one field, which opens a second picker: two taps before a project can be chosen. Delegate and Labels are full-screen dialogs for a short list.
- There is no swipe, although every task list on a phone completes with a swipe right and schedules with a swipe left.

## What Changes

Below 768 px only:

- **A decision bar at the bottom of the screen.** Pinned above the tab bar, always in the same place: Today, Schedule, Move, Complete and More as five 48 px targets with an icon and a word, and under them Back and Skip. More opens a menu with Delegate, Labels, Someday, Open and Trash. No keys are printed. Every decision the screen has today stays.
- **No floating add button on this screen**, as on the other screens that end in their own action; the tab bar stays. A toast shows above the bar.
- **Swipes on the card,** with the gesture of the task rows: right completes, left opens the scheduling sheet.
- **Pickers are bottom sheets.** Move lists the projects at once; Delegate and Labels open as sheets sized to their list; none opens the keyboard until its field is tapped.
- The same card inside the Open Loops home's Clarify move gets the same two rows under the card (not pinned, the home keeps its add button).

Every control writes exactly what the same decision writes today, so nothing changes for offline use or sync.

Out of scope: every width from 768 px and every pointer that is a mouse (unchanged); the keys; what a decision writes; the queue and its count; the scheduling sheet's content; the task page that Open leads to on a phone; the Inbox list itself; a swipe that skips (see design D4); the Android and iOS shells.

Advances the ROADMAP item "Shells that feel native" (the phone reads like an app, `mobile/AUDIT.md`).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `inbox-triage`: "Announcements and touch" changes what the bar is below 768 px; three requirements are added (the decision bar on a phone, swipes on the card, pickers as sheets).

## Impact

- Changed: `web/src/app/TriageView.tsx` (the phone layout, the swipes, the pickers), `web/src/app/router.ts` (`VIEW_QUICK_ADD.triage` is false: no floating add button), `web/src/app/quickAddRoutes.test.ts` (`/triage` moves to the routes without the button), `web/src/app/triageView.test.tsx`, `scripts/i18n/allow.txt` (the key name "Enter" moved with the bar), `docs/process-the-inbox.md`.
- New: `web/src/app/TriageBar.tsx` (the bar in both shapes).
- No op field, no route, no server change, no environment variable, no dependency.

# Proposal

## Why

The owner finds the Focus screen (`web/src/app/focus/`) confusing and unfinished. Several problems add up to that:

- The header reads "Focus" with the mode ("Pomodoro") as secondary text, so the two words sit apart.
- Start, Pause and Complete are header buttons, far from the timer.
- A status line, a "Logged as time" line and up to four secondary buttons crowd the timer card.
- The task's project, due date, notes and the whole subtask checklist sit below the timer at the same weight.
- A permanent line of shortcut hints ends the page.

Nothing has a hierarchy, and the screen does not answer its one question at a glance: what am I working on, and how long is left?

## What Changes

- **One purpose: "I'm working on THIS now."** The screen becomes a centred stage with four things on it:
  - the task's title, large, with its project in small type above it;
  - the time left (or worked, in Flowtime), very large in tabular figures;
  - a quiet state line ("Work · 2 of 4", "Short break", "Paused");
  - one primary control (Start, Pause or Resume) with Complete beside it.
- **The rest moves behind a quiet menu.** The header keeps the page template's compact row with the title "Focus" and one overflow menu holding:
  - the mode (Pomodoro, Flowtime, Countdown);
  - Change task;
  - Noise;
  - Today's sessions;
  - Settings;
  - Help.

  The mode leaves the header's secondary text.
- **Details on demand.** Notes and subtasks are behind one disclosure under the controls, closed by default and remembered on the device. The next open subtask shows as one line under the title, and it can be ticked there.
- **Breaks are a calm state, not a new screen.** During a break:
  - the same stage stays;
  - the task's title dims;
  - the time left counts the break;
  - the primary control reads "End the break";
  - the surface takes the sunken tone.

  When a session or break ends, the done state takes the controls' place on the stage. It names what ended, the time worked and one primary next step, with the other steps as quiet buttons, including Extend (+5 and +15 min).
- **Today's sessions.** A new menu entry opens a sheet listing today's focus sessions: task, mode and length. The list is read from the time entries the screen already writes with `focus_mode`, so no new data is involved.
- **Keys stay; the printed hint goes.** Space, Enter, Esc, `b` and `n` are unchanged and listed in the registry. The hint line is removed, following interface rule 5.
- Unchanged:
  - time tracking (`Sessions are time entries`, `Session details on the time entry`);
  - the end sound, including Long until acknowledged;
  - the break reminder;
  - the timer modes, accuracy and the device-only timer state;
  - Countdown presets;
  - background noise;
  - the Live Activity bridge.
- No new op field, entity, route, setting or dependency. Not **BREAKING**.

Out of scope:
- New timer modes.
- Statistics about focus.
- A full-screen or picture-in-picture timer.
- Changes to Settings → General → Focus.
- The Live Activity itself (`focus-live-activity`), which keeps reading the same state.

Roadmap: the "UX polish (2026-11 feedback)" area of ROADMAP.md, row 3. It follows up the shipped `focus-mode`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `focus-mode`: what the Focus screen shows and where (Focus screen, Focus screen layout, Done state and tone), and a new Today's sessions requirement.

## Impact

- Web:
  - Restructured: `web/src/app/focus/FocusView.tsx` and `FocusParts.tsx`.
  - New: a small `FocusSessions.tsx`, a lazy sheet.
  - Updated: `focusView.stories.tsx` and the focus interaction tests.
  - `useFocusTimer.ts`, `focusActions.ts` and the time entry writes are unchanged.
- Docs: `docs/focus.md` and the keyboard guide, whose keys do not change.
- Size: about the same. Code moves rather than grows, and the sessions sheet is lazy. The Focus chunk is already off the first load, and the budget is unchanged.

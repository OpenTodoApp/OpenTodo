# Design

## Context

Observed (`FocusView.tsx`, `FocusParts.tsx`), top to bottom:
- **Header.** `PageHeader` title "Focus", the mode as secondary text, Back, two visible actions (Start/Pause/Resume and Complete), and an overflow menu (the modes, Change task, Noise, Settings, Help).
- **Notice and empty states.**
- **Done state.** It shows up to three equal buttons.
- **`TimerCard`:**
  - a status line;
  - "Logged as time on this task";
  - the timer;
  - Take or End a break, Stop (Flowtime), Next task, and +N min.
- **`FocusTask`:** title, project, "Due …", the notes with Edit or Add, and the full subtask checklist with its count.
- **A printed shortcut line.**

A break is already a phase of the same card, not a screen. The break reminder is a shell-level toast, and there is no session history.

Specs: `focus-mode` (Focus screen, Focus screen layout, Session controls, Done state and tone, Extend a finished session, and others). Time entries carry `focus_mode`, `focus_session` and `planned_end_at` (`Session details on the time entry`).

## Goals / Non-Goals

**Goals:**
- One glance answers "what, and how long".
- One primary control.
- Everything else one click away, never on the stage.
- Breaks feel like the same place, breathing.

**Non-Goals:**
- Timer logic.
- New preferences.
- Statistics.
- A distraction blocker.

## Decisions

**D1. A stage, not a page of cards.** The content column centres one stage, vertically centred in the viewport from 768 px and top-aligned with 24 px of room on a phone.
- The stage, in order:
  - the project, in the metadata size and muted;
  - the title at the `display` step, up to three lines;
  - the next open subtask as one line with its checkbox, when there is one;
  - the time at about 96 px (64 px on a phone) in tabular figures;
  - the state line in the metadata size;
  - the controls row: the primary button (Start, Pause or Resume) and Complete as a secondary button.
- Next task (`n`) and Take a break (`b`) are quiet icon buttons with tooltips after them. Flowtime's Stop replaces Pause's neighbour.
- Nothing else is on the stage, and no card surface is used.
- Alternative considered: keeping the card and tidying it. Rejected: the card is what makes the screen read as a settings panel rather than a moment.

```
  ‹ Focus                                            ⋯
 ─────────────────────────────────────────────────────

                     Website launch
            Write the release notes for 0.22
               ○ Collect the merged PRs

                        18:42
                    Work · 2 of 4

              [  Pause  ]   Complete    ⏭  ☕

                     ▸ Notes and subtasks
```

During a break, the same stage:

```
            Write the release notes for 0.22      (dimmed)

                         4:12
                      Short break

                  [ End the break ]   ⏭
```

**D2. The header.**
- The compact header: Back, the title "Focus", and the overflow menu as its one action. The page template still holds, with at most two visible actions.
- The mode is no longer the header's secondary text. It is in the state line ("Pomodoro · Work · 2 of 4" when the cycle matters, "Flowtime" or "Countdown · 25 min" otherwise) and checked in the menu.
- This fixes the "Focus · Pomodoro" misalignment by removing the pairing, not by nudging it.
- Alternative considered: no header at all, which is a true focus mode. Rejected: the page template and Back are what keep the app's shape and the phone's bar consistent. A hidden header would be one more special case.

**D3. Details behind one disclosure.**
- "Notes and subtasks" (with the subtask count) sits under the controls, closed by default and remembered on the device in `localStorage`.
- Opened, it shows the notes, read-only with Edit opening the task panel as today, and the checklist.
- The one next subtask on the stage keeps the most useful detail visible.
- "Logged as time on this task" becomes part of the state line's tooltip and accessible description.
- Alternatives considered:
  - Showing the notes always. Rejected by the owner's purpose.
  - Hiding subtasks entirely. Rejected: the next step of a task is often a subtask.

**D4. Done state on the stage.**
- When a session or break ends, the time shows what was worked ("25:00 worked") and the state line names what ended.
- The controls row offers one primary next step (Start the break after work, Start the next session after a break, Choose another task after Complete). The other steps are quiet buttons: Complete the task, Next task, +5 min and +15 min while Extend applies.
- The tone, Long until acknowledged, the vibration and the announcements are unchanged.

**D5. Today's sessions.**
- A menu entry opens a lazy sheet (a popover from 768 px) listing today's time entries whose `focus_mode` is set. Each line shows the start time, the task, the mode and the length, with the total at the top.
- It is read from local rows only, works offline and is the same with end-to-end encryption, because the task titles are decrypted on the device as everywhere else.
- Nothing is written.
- Alternative considered: a history page. Rejected: Statistics and the task's Time tab already hold the long view.

**D6. Keys and hints.**
- Space, Enter, Esc, `b`, `n` and Extend behave as today.
- The printed hint line goes, because keys show in tooltips, the menu and the cheat sheet (interface rule 5).
- "Show shortcut hints" on prints them under the controls, as everywhere.

## Data model

None. The screen reads tasks and time entries and writes what it writes today: time entries, completion, and subtask ticks through `mutate()`. No op schema change.

## Interface budget

- The stage is the content column, the one scroll region (the panel is closed on Focus).
- There is one header row and no second chrome row.
- The stage shows at most four task facts (project, title, next subtask, time).
- No new sidebar destination: Focus stays in More.
- No new shortcut.

## Size

No dependency. The Focus chunk stays about the same size, and the sessions sheet is its own lazy chunk of a few KB. The first load is untouched.

## Risks / Trade-offs

- [People who read notes during a session lose them from sight] → the disclosure remembers it was opened, per device.
- [A long title on a phone pushes the timer down] → the title clamps to three lines, with the whole title in its accessible name and tooltip.
- [The Live Activity shows the mode while the screen no longer puts it in the header] → the mode is in the state line, and the bridge payload is unchanged.

## Migration Plan

UI only. Rollback is a revert. The remembered disclosure state is a new device-only key, and its absence reads as closed.

## Decided for the night (2026-11-09)

The owner asked for the open OpenSpec changes to be implemented overnight; each open question below was decided with its recommendation, for the owner to review and overturn in the morning.

### The questions as asked

1. **Should the next open subtask be on the stage** (D1), or should the stage hold only the task? Recommendation: show it. It is the smallest real next step, it can be ticked in place, and a task without subtasks shows nothing extra.
2. **Should Today's sessions count breaks**, for example "4 sessions, 1 h 40 min, 3 breaks"? Recommendation: no. Breaks write nothing today (by spec), and counting them would need new data for a number nobody acts on.

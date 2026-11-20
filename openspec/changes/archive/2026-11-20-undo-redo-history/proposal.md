# Proposal

## Why

Multi-step undo and redo, free of the toast deadline (GitHub issue [#1488](https://github.com/OpenTodoApp/OpenTodo/issues/1488)). Today Undo reaches only the latest toast: Ctrl/Cmd-Z works while the offer shows, a new toast replaces it, one undo never exposes the step before, and there is no redo. Yet the history is already there — `web/src/lib/undo.ts` keeps the last 20 batches in IndexedDB, each with its inverse (previous values, the Trash for created rows) and the field clock each change got. The records outlive the toast; the UI just cannot walk them. This change turns that log into real undo and redo stacks with keyboard shortcuts and named steps, keeping everything local. It is `needs design`; this is the design.

## What Changes

- Walk the existing batch log as an **undo stack** (undo the newest not-yet-undone batch, repeat backwards) and a **redo stack** (redo in original order), regardless of toast expiry, dismissal or navigation. Bulk changes stay one step.
- **Redo** reapplies an undone batch. A new recorded action clears the redo stack (linear history). Keep 20 batches across reloads; clear the stacks on sign-out.
- **Keyboard everywhere history exists:** Ctrl/Cmd-Z undo, Ctrl/Cmd-Shift-Z redo, Ctrl-Y redo on Windows/Linux — without stealing a text field's or editor's own undo/redo.
- **Undo/Redo in the command palette** (reachable on desktop and on a phone), offered while that direction has history, each naming the next step and its task or count ("Undo: complete 'Pay rent'", "Undo: 3 tasks completed"). Toast Undo uses the same history.
- **Descriptive feedback** after each step ("Undid completion of 'Pay rent'", including anything skipped) with no new countdown.
- Existing collaboration limits stay and are documented: a field changed again since is skipped by its clock; undoing a creation trashes the row; unseen offline edits resolve last-writer-wins; history is this device's own.

## Design

The existing `assistantUndo` store already orders batches by `created_at` and marks `undone_at`; the two stacks are views over it, so no new table is needed.

- **D1 — The two stacks.** The undo stack is the batches with no `undone_at`, newest first; the redo stack is the batches with `undone_at`, in undo order. Undo acts on the top of the undo stack and sets `undone_at`; redo acts on the top of the redo stack and clears it.
- **D2 — Redo needs a forward capture.** `undoBatch` applies the inverse and marks the entry undone, but stores nothing to go forward again. Before applying the inverse, capture the current values and field clocks of exactly the fields the undo will change, as the entry's **redo payload**; `redoBatch` applies that as one `mutateMany`, the mirror of `undoBatch`.
- **D3 — A new action clears redo.** When `applyBatch` records a batch, drop every entry that is currently undone (the redo stack), so history stays linear — the standard model, and what the issue asks.
- **D4 — Clock checks both ways (the careful part).** Undo already skips a field whose clock moved since the batch. Redo applies the equivalent check against the redo payload's clocks and replays only the fields actually undone, never the skipped ones. The subtle case the issue names — undoing our own later change must then let us undo an earlier change to the same field — is handled by refreshing the earlier batch's recorded clock for that field to the value undo just wrote, so the earlier undo still recognises the field as "ours". This bookkeeping is the main design risk and is specified below with scenarios.
- **D5 — Keyboard without stealing text undo.** Bind the shortcuts globally through the existing shortcut registry, but let them act only when focus is not in an `input`, `textarea`, `contenteditable` or a rich editor that owns its undo; there the browser's own undo/redo stands. With no history in the active direction the shortcut does nothing.
- **D6 — Where the controls live.** Undo and Redo as command-palette commands, offered while that direction has history and labelled with the next step's name. The palette is reachable on desktop (Ctrl/Cmd-K) and on a phone (the tab bar's Search), so a person can still undo after the toast is gone. The existing undo toast keeps its button and calls the same history. No persistent always-visible control: this app surfaces global actions through the palette (as it does Sync now, workspace switches), not a standing menu, and the palette filters out disabled entries, so the commands appear only when the direction is possible rather than present-but-disabled.
- **D7 — Naming a step.** A step's name is its verb and its subject: the task title for one item ("complete 'Pay rent'"), the count for many ("3 tasks completed"). Where the stored `label` already says this it is reused; otherwise a describer derives it from the batch's source and inverse. Assistant and theme-editor undo stay their own controls (out of scope).
- **D8 — Scope.** Local to the device (the log already excludes other devices' and users' actions); cleared on sign-out; 20 batches kept across reloads. Cross-device history and stronger conflict handling remain separate work.

## Capabilities

### New Capabilities

- `undo-history`: the local undo and redo stacks, their shortcuts, controls, naming and limits.

### Modified Capabilities

None. (`bulk-edit` and `in-app-assistant` keep recording batches as they do; this reads them.)

## Impact

- Web only, reusing `mutateMany` and the existing store, so undo and redo stay offline-capable synced operations. Adds a redo payload to each entry (additive to the stored shape), a `redoBatch`, a small history controller feeding the shortcuts, the palette commands and the feedback, and reusing the batch's stored label for step names. No server, op-schema, API or dependency change. New code loads with the controls, not on first paint.
- Honours the end-of-November feature freeze: this is design only; implementation waits for the freeze to lift and the owner's go-ahead.

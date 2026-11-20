# Proposal

## Why

More haptic moments in the apps (GitHub issue [#1445](https://github.com/OpenTodoApp/OpenTodo/issues/1445)). The haptics bridge and two taps — a success tap when a task is **completed** and a light tick when a long press **lifts a row** to drag — shipped in 1.5.0. The reporter asked for more, and the maintainer agreed to "a light tap when opening a task and when creating one." But adding those is a design decision, not a plain fix:

- The live requirement (`appearance-preferences`, "Haptic feedback preference") **scopes haptics on purpose** to completion and drag-lift.
- The project rule is "keep haptics for moments of real feedback, so they stay meaningful rather than buzzing on every tap."

**Opening a task is the app's most frequent action** (nearly every row tap opens or expands one), so a tap there is the case most in tension with that rule. This proposal puts the choice of which moments to add to the owner/Lead, with a recommendation.

## What Changes

Add light taps at new moments, reusing the existing bridge `tick` kind and the existing `haptics` on/off preference. No new bridge kind, no new preference, no native change.

- **Creating a task** → a light tick (recommended). A task is created perhaps a few times in a sitting; it is a real, confirmed action, symmetric with the completion tap.
- **Opening a task** → a light tick (the decision below). What the reporter asked for, but it fires on nearly every row tap.

## Design — decisions for the owner/Lead

- **D1 — Create a task: include (recommended).** Low frequency, a clear moment of real feedback. Fires once when the new task is written (quick add, the add line, the composer), not on each keystroke.
- **D2 — Open a task: the call.** The reporter wants it and the maintainer agreed; against it, opening is the most frequent tap in the app, so a tap there risks the "buzzing on every tap" the project rule warns against. iOS Reminders and Things do not tap on open. **Recommendation: leave open-task out** and keep haptics to deliberate moments (create, complete, drag-lift); it is behind the one on/off switch either way, so a user cannot keep completion taps but drop open taps. Easy to include if the owner prefers — it is one call site.
- **D3 — A stronger completion effect** (the reporter also mentioned this) would need a new bridge kind and native work on both shells. **Recommendation: keep the current success tap**; out of scope here.

The spec delta below reflects the recommendation (add **create**, leave open-task out). If the owner wants open-task too, it adds one clause and one call site.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `appearance-preferences`: "Haptic feedback preference" adds the create-a-task moment.

## Impact

- Web only: one new call to the existing `tick()` at task creation, gated by the existing preference and capability check. One unit/interaction test. No new bridge message, no native change, no new preference, negligible bundle impact. (If open-task is chosen, one more call site at the row-open path.)

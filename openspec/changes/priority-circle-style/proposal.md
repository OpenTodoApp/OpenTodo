## Why

Desktop distinguishes P1 and P2 with different fills, while the phone lists and task page show outlines. Issue #2170 proposes one appearance preference for both layouts, retaining the accessible filled style by default.

## What Changes

- Offer **Priority circles** under Settings → Appearance with **Filled** and **Outline only**.
- Use the same preference in desktop and phone task lists and task details. P3 stays blue and P4 stays neutral.
- Leave priority values, priority labels, completion behaviour and the meaning of existing priority marks unchanged.

This is a follow-up to the priority-ring accessibility work in #1674, #1693 and #1783. There is no dedicated roadmap item yet. Native widgets and priority picker swatches are outside this change.

## Capabilities

- `appearance-preferences`: one synced preference for the priority circles.
- `task-list-presentation`: the priority ring scenario follows the account preference.

## Impact

Adds an optional user preference field, a settings row and shared presentation rules. No new route, mandatory environment variable or dependency.

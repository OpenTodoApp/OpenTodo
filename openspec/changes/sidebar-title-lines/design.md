# Design

## Context

`WorkspaceControl` renders its trigger as a mark, then one `truncate` span with `<InstanceWordmark /> · {name}` while there is one workspace, or just `{name}` otherwise, then the update dot and a chevron (`web/src/app/WorkspaceControl.tsx`). The sidebar header row is `min-h-9` (36 px), and `min-h-8` with a fine pointer (`web/src/ui/patterns/Sidebar.tsx`, `SidebarHeader`). The search button sits to its right. The line truncates as a whole, so the workspace name, which comes last, is the first thing lost.

## Goals / Non-Goals

**Goals:** both names readable in a narrow sidebar; the header row height within the 40 px the spec allows; no change for accounts with several workspaces.

**Non-Goals:** new information in the header, or a new layout for the switcher menu.

## Decisions

### D1. A two-line label inside the existing trigger

The single `truncate` span becomes a `flex flex-col` block with two `truncate` lines:
- The instance wordmark, unchanged: body size, semibold, strong. This keeps the "Sidebar header row" rule for the wordmark.
- The workspace name in `text-meta text-muted`.

The two line heights are 20 px and 18 px, 38 px in total. That fits the 40 px limit in "Header at rest", and the header grows by at most 2 px over its minimum. The mark and the chevron are centred against the block, so they stay vertically centred.

Alternatives considered:
- **Workspace name first, instance name second.** Rejected. The wordmark is the header's anchor in the existing requirement. Below it, the workspace name reads as "where you are inside it".
- **Drop the instance name once the line is too narrow.** Rejected. It makes the header change with the width, and the reporter asked for both names.
- **Show both lines with several workspaces too.** Out of scope. The spec deliberately shows the app name only with one workspace, and nothing is wasted there.

### D2. Accessible name unchanged

The menu trigger's label stays `Workspace: {app} · {name}`, so screen readers and the existing tests that read the label are unaffected. Only the visible text changes.

## Interface budget

No row of chrome is added: the header is still one row, at most 2 px taller. No property, destination or shortcut changes, and no scroll region is added.

## Size

A few class names. No measurable effect on the bundle and no dependency.

## Risks / Trade-offs

- **[A long workspace name now truncates at the smaller size]** It gets a whole line of its own, so it shows more characters than before, not fewer.
- **[Baselines]** The `Sidebar` stories with one workspace change by design. → Inspect each diff before accepting it: only the header text should move.

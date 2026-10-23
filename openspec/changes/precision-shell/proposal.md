# Proposal

## Why

Part 2 of the "Precision" redesign (after `precision-tokens`, before `precision-rows`). The owner's references (Linear) and the round-2 mock-ups agree on a shell that this app does not have yet:

- **"The space is all used."** Pages sit in a frame (60 rem for lists, 72 rem for a project, 80 rem otherwise) that leaves a wide screen half empty; the mock-ups fill one inset content surface.
- **"I feel in control": every pane owns its header.** Our headers carry a 28 px title on every page, and the sidebar's collapse control is hidden in its footer. The mock-ups use a compact 46 px header on tool pages, keep the big title for the day pages that talk to you, and start every header with the sidebar toggle.
- **Colour only for state.** The active sidebar row is an emerald pill; in Precision it is a neutral selected surface.
- **Key sequences are taught where you look.** "Go to Agent · G then J" in Linear's tooltip: our sidebar tooltips don't name the `g` sequences.

## What Changes

- **One inset content surface:** from 768 px the content column is a surface 8 px from the window, with the surface radius and one hairline, on the canvas; the sidebar sits on the canvas beside it without an edge.
- **Two page heads:**
  - **Day pages (Today, Upcoming):** a top row with the sidebar toggle and the actions, then the title at the display step with the date line beside it, then a briefing slot. `briefing` writes the briefing itself later.
  - **Every other page:** one compact 46 px row with the toggle, the title at 14 px with its dot or icon, the lead line beside it, and the actions, overflow and Help at the right.
  - A second row keeps tabs and tools as before.
- **Full width:** the page frames and their widths are gone. Content fills the surface; a form keeps its fields at 42 rem. Opening the panel narrows the surface from the right, so nothing moves.
- **The sidebar toggle in the header** (from 1024 px), with its state and the `[` shortcut in its tooltip. The footer keeps an Expand control only on the collapsed rail.
- **Neutral active sidebar row:** the selected surface with strong text and icon, and a muted count.
- **Key sequences in tooltips:** "Go to Today · G then T" on every sidebar destination, read from the registry; any tooltip's sequence shows as keys joined by "then".

Out of scope:
- The task panel stays a docked panel; `task-full-page` replaces it.
- Row anatomy is `precision-rows`.
- The settings page's own layout is `precision-settings`.
- The phone layout below 768 px is unchanged.

## Capabilities

### Modified Capabilities

- `app-shell`:
  - "Page template": two heads, an inset surface, full width;
  - "Resizable sidebar", "Compact sidebar on a desktop" and "Running entry pill in the footer": the toggle moves to the header;
  - "Sidebar tones": a neutral active row;
  - new "Sidebar toggle in the header".
- `keyboard-shortcuts`: new "Key sequences in tooltips".

## Impact

- `web/src/app/Shell.tsx`, `web/src/ui/patterns/PageHeader.tsx`, the new `web/src/ui/patterns/sidebarToggle.ts`, `web/src/ui/patterns/Sidebar.tsx`, `web/src/ui/Tooltip.tsx`, `web/src/app/Sidebar.tsx`, `web/src/app/SidebarFooter.tsx`, `web/src/app/TaskListView.tsx`, `web/src/index.css`, the five catalogs.
- Most visual baselines change again.
- Supersedes the frame rules of `page-frame-v3` and `list-stays-still` (archived); their e2e checks still pass under full width.

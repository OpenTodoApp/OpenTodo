# Design

## Context

See proposal.md, "Why", for the cause. In short, the shared tab row (`web/src/ui/Tabs.tsx`) is:

- `overflow-x: auto`, which makes the computed `overflow-y` `auto` as well,
- with a 1 px bottom border on the row, and
- tabs with a 2 px bottom border and a −1 px bottom margin, so that the selected underline overlaps the baseline.

The overlap puts 1 px of content outside the row's padding box. The browser therefore offers a vertical scroll of 1 px and draws the `.ui-scroller` scrollbar, 6 px wide in WebKit and Blink.

There are three callers: the task panel's conversation tabs, which are sticky with their own background; the project view; and the workspaces settings. All three use the row as is, so fixing the primitive fixes all of them.

The layout check's `verticalScrollers()` (`scripts/ux-audit/measure.mjs`) skips an element whose `scrollHeight` is at most `clientHeight + 1`. That tolerance absorbs sub-pixel rounding elsewhere, and it is exactly why this 1 px overflow was never reported.

## Goals / Non-Goals

**Goals:**
- No vertical overflow in a tab row, so there is no scrollbar and no vertical scroll, instead of an overflow that is merely hidden.
- The same look: the row height stays the same, and the 2 px accent underline still sits on a 1 px baseline that spans the row's visible width while it scrolls sideways.
- A check that fails on a tab row with any vertical overflow.

**Non-Goals:**
- Changing the 1 px tolerance of the general scroll-region count.
- Restyling the tabs or the When segments.

## Decisions

### D1. Draw the baseline as an inset shadow on the row, not as a border

The row loses `border-b`. It gets a 1 px inset bottom shadow in the border token instead, `shadow-[inset_0_-1px_0_var(--ot-border)]` (or a component class in `@layer components` if the arbitrary value reads badly). The tabs lose `-mb-px`.

This works for three reasons:

- An inset shadow is painted inside the padding box and takes no layout space. The tabs' content box therefore ends exactly at the row's bottom: nothing overflows.
- A child's border paints above its parent's background and box-shadow. The selected tab's 2 px underline therefore covers the baseline where they meet, which is the same picture as today's overlap.
- On a scroll container, an inset shadow belongs to the container box, not to the scrolled content. The baseline therefore spans the visible width at every scroll position, like the border did.

The baseline colour is a custom property (`--tab-row-line`, the border token by default), so the project view, which drew its row border in the softer divider colour, keeps that colour through a `ui-tab-row-soft` modifier instead of `border-soft`.

The row height is unchanged. Before, it was the tab height minus 1 px of margin plus a 1 px border. After, it is the tab height with neither. Nothing below the row moves.

Alternatives considered:

- **Keep the overlap and add `overflow-y: hidden`.** Rejected. Clipping happens at the padding box, which is above the border, so the selected underline would lose its bottom pixel and read 1 px thinner. That breaks the requirement's "full thickness".
- **`overflow-y: clip`.** Rejected. Combined with a scrollable `overflow-x`, it computes to `hidden`, so it has the same clipping.
- **A `::after` line at the row's bottom.** Rejected. Inside a scroll container, an absolutely positioned child scrolls away with the content and only spans the initial width.

### D2. Also set `overflow-y: hidden` on the row

With D1 there is no vertical overflow left. `overflow-y-hidden` is belt and braces: a future change that adds a vertical overhang to a tab (a badge, a focus ring offset) is clipped instead of bringing the scrollbar back. The focus outline uses `outline-offset: 2px`, and outlines don't create scrollable overflow, so focus stays visible. The test in D4 checks this.

### D3. Forced colours

In forced-colours mode, browsers drop `box-shadow`. The row then gets `forced-colors:border-b` back, so the baseline stays visible. Only in that mode, and only there, the selected tab's underline is clipped by 1 px under D2. The system colours already mark the selection, so this is acceptable.

### D4. Tests: the class contract in unit tests, real geometry in the layout check

- **Unit test (`web/src/ui/surfaces.test.tsx`).** happy-dom does no layout, so this test asserts the contract: the row carries `overflow-x-auto` and `overflow-y-hidden`, has no `border-b` outside forced colours, and no tab carries a negative bottom margin.
- **Layout check (`scripts/ux-audit/measure.mjs`).** A new `tabRowOverflow()` fails, with zero tolerance, for every `[role="tablist"]` whose `scrollHeight > clientHeight` or whose computed `overflow-y` is not `hidden`. It runs on every screen and overlay that `scripts/e2e-layout.mjs` already visits: the project screen with the task panel (`task-history` and others), the settings, and every width and text size the check uses (360/390/768/1280 px, 20 and 24 px text). It's separate from `verticalScrollers()`, so the general tolerance stays as it is.

### Interface budget

The budget in docs/interface-guide.md is not touched, except that one false vertical scroll region per screen with tabs is removed. No chrome row is added and no property or shortcut changes.

### Size

A few class names. There's no measurable effect on the bundle, the binary or memory, and no dependency.

## Risks / Trade-offs

- **[The baseline changes colour slightly]** A shadow in the same token can render a hair differently from a border on some displays. → The Storybook visual baselines of `Surfaces/Tabs` and the task panel show any difference. Accept only after looking at the diff.
- **[A caller relied on the row's `border-b`]** For example, the sticky conversation row could have used it to separate itself from the content scrolling under it. → The shadow draws the same line in the same place. Checked against the sticky `Task/Panel` story while scrolled.
- **[Forced colours lose 1 px of underline]** See D3. Accepted, because the selection is still marked by system colours.

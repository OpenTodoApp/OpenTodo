# Design

## Context

Notes use one editor everywhere (`rich-text-editing` "Rich-text notes editor") with headings 1 to 3. The interface guide allows three vertical scrollers per screen (sidebar, content, panel) and no chrome between content.

## Goals / Non-Goals

Goals: jump to any heading of a long note in one step, from the mouse or the keyboard; know where you are in it.

Non-goals: editing structure from the outline, folding, a stored outline.

## Decisions

### D1. Headings from the editor state, 3 or more

The outline lists the top-level heading nodes of the document (levels 1 to 3), in order, with their plain text; headings inside quotes, lists and tables are not listed. It appears only when the note has 3 or more headings, so short notes show nothing new. It is recomputed from the editor's state on each transaction (cheap: one pass over top-level nodes), so local and remote edits update it.

### D2. A column when there is room, a menu otherwise

When the note's own column is at least 52 rem wide (the readable column of `note-pane-width` plus 12 rem), the outline is a 12 rem column at the note's start-side margin, `position: sticky` inside the content's or panel's scroller, never a scroller of its own: an outline taller than the viewport is cut with "+n more" that opens the menu. Below that width, and always in the docked task panel and project notes, an **Outline** button in the note's top corner (beside the Formatting toggle, revealed with it on a fine pointer, always shown on a coarse pointer when the note has 3+ headings) opens the `Menu` primitive with the headings.

Alternatives considered:
- **Always a menu.** Rejected: on a wide standalone note the column shows where you are at a glance.
- **A column that scrolls on its own.** Rejected: a fourth scroll region breaks the budget.

### D3. Current heading and jumping

The current heading is the last one whose top is above 25 % of the scroller's height, marked with the accent tone and `aria-current="location"`. Choosing a heading scrolls it to the top of the scroller (respecting reduced motion) and, in an editable note, puts the caret at the heading's start; in a read-only note it moves focus to the heading for screen readers.

### D4. Keys

`Ctrl+Shift+O` / `⌘+Shift+O` (editor scope, `editor.outline`, free in the registry; `Shift+O` alone is a list key in another scope) moves focus to the column or opens the menu. ↑ / ↓ move, Home / End go to the first and last heading, Enter goes, Esc returns focus to the note where it was.

### D5. Interface budget

No row of chrome (the button shares the Formatting toggle's corner; the column sits beside the note, not above it), no new scroll region (sticky inside the existing scroller), one shortcut registered without a conflict, no task property.

## Data model

None.

## Size and memory

Under 1 KB gzip in the editor chunk; one pass over top-level nodes per transaction.

## Risks / Trade-offs

- The column takes width from wide notes only; narrower ones keep the menu, so the readable column is never squeezed.
- Notes with many headings (over 60) make a long menu; it scrolls within the menu popover, which the guide allows for menus.

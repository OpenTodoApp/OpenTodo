# Design

## Context

`Tooltip` (`web/src/ui/Tooltip.tsx`) opens on hover and on keyboard focus and deliberately not on touch (issues 169 and 1362: a tap on a button left its tooltip on screen). The rule was written for controls. Screens also use the tooltip to explain a word, and there a phone has no way to the text.

## Goals / Non-Goals

**Goals:** a phone can read every tooltip that sits on text, without changing a screen.

**Non-goals:** tooltips on controls; a screen reader on touch; restyling the tooltip.

## Decisions

**D1. Fix the primitive, not 28 screens.** The trigger is known to the tooltip: if it is not a control and not inside one, a tap on it does nothing today, so the tap is free to open the tip. One condition in `Tooltip`'s `onClick` covers every present and future use. Considered: replacing each with `FieldHint` (the "?" that shows its text in place on a coarse pointer). Rejected as the general answer: it adds a visible control beside 28 words and reflows the row; it stays the right part where a hint belongs to a field.

**D2. A control is found by selector.** `a[href]`, `button`, `input`, `select`, `textarea`, `summary` and the roles button, link, menuitem, tab, checkbox, switch and option, on the trigger or an ancestor (`closest`). A span with `tabIndex={0}` is not a control: screens add it so the keyboard can reach the tooltip.

**D3. Open at once, close on the next press.** No delay: a tap is intent. The tip stays until a press outside the trigger, a scroll (capture phase, so any scroller counts), Escape or blur; a second tap on the trigger closes it (the pointer-down remembers that it was open, so the click does not reopen it). The trigger's own `onClick`, if it has one, still runs first.

**D4. Budget, data, size.** No chrome, no data, a few lines in a primitive already in the entry chunk; `make bundle-budget` confirms.

## Risks / Trade-offs

- **A trigger inside an element that handles clicks without being a control** (a list row that opens on a tap, such as a row of Updates since `touch-open-and-controls`). The tip would open while the row navigates. → such rows skip taps on `[data-tip]`, the mark the tooltip already puts on its trigger; done for Updates in this change, and named here as the rule for the next such row.
- **The old defect coming back** (a tip left on screen after a tap on a button). → controls are excluded, and the existing scenarios "Tap on a phone" and "Focus returned after a tap" keep their tests.

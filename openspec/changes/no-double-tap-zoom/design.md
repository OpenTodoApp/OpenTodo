# Design

## D1: `touch-action: manipulation` on every element, on coarse pointers, in `@layer base`

`touch-action` does not inherit through a scroll container: the browser intersects the values of the touched element and its ancestors only up to the nearest one that scrolls. The app's lists, sheets and panes scroll in their own containers, so the value on `html` alone would leave double-tap zoom on inside them. The rule therefore applies to every element (`*, *::before, *::after`).

It lives in `@layer base`, below Tailwind's utilities: `touch-none` on drag handles, sheet grips and the graph, and any inline `touch-action`, still win. Unlayered, it would override them and break dragging.

It applies only under `(pointer: coarse)`, as the overscroll rule beside it does; double-tap zoom does not exist with a mouse.

`manipulation` keeps panning and pinch zoom and removes only double-tap zoom, so the design system's rule that pinch zoom stays available holds (WCAG 1.4.4 Resize text is met by pinch zoom and the system text size).

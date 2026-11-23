# Design: new-project-top-level

## D1. No inferred parent

`Sidebar.tsx` `startAdding` sets the form's parent to `''` (Top level) instead of the project on screen. The form's Parent project picker is unchanged. Data model: none (the same `parent_id` field, set only from the picker). Interface budget: unchanged (no new control).

## D2. Above the keyboard on iOS

The form is in the sidebar's scroller. It scrolls itself into view when it opens. A test pins that the form opens with its name field focused and both fields inside the scrolled-into-view form.

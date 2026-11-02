## Why

The owner tried the new routine editor (routines-dynamic-data, PRs #729 and #730) at 1280 and 390 px and found its pickers ugly, too big or hard to use: Pick's mode menu hung off the word's right edge over the sidebar with a solid green pill for the chosen mode, a short word such as "all" sat in a 44 px box with a gap after it, a comment was cut to one line with its values read as «each task», the "/" list opened above the field and covered the step, a newly added step showed "needs a value here" before the user had typed anything, a second Escape threw away a typed comment without a word, and the condition rows mixed label styles and select widths. Two of these change specified behaviour: Escape in a text and when an empty input's error shows.

## What Changes

- A text word keeps its text on Escape (as Enter and leaving the field do); Escape never throws typed text away. The first Escape still closes an open value list.
- "/" opens the value list at the caret and "+ value" at its button, below the field when there is room; the nearest flowing value is active in both. On a phone the sheet repeats the text being edited at its top.
- A text word shows its whole text, wrapped, with its values as chips; a very long text is kept to four lines with Show more.
- Pick's mode word opens the same anchored list as every word, the chosen mode a row with a check.
- Words have no minimum width (a word is an inline target: 44 px high on touch screens, as wide as its word); a value chip sits directly against the punctuation after it.
- "needs a value here" waits until focus has left the step's card or Save is pressed, and hides while its text is being typed; type errors show at once as before.
- The condition rows are one grid: names in one plain style, controls of one width; the sheet opens on its rows without a ringed first field and keeps Done at its bottom edge.
- The condition summary names each date test once ("due earlier", "due within 3 days", "no deadline") instead of "due: due earlier", in the six languages.
- The routine name's placeholder uses the standard muted placeholder style.

Out of scope: the Routines page empty state and starter gallery (`routines-starters`), the changes editor of Change tasks, and any change to the step catalogue, the checker or the op log. No new environment variable; nothing is **BREAKING**.

ROADMAP: a polish of the shipped `routines-dynamic-data` row; no new row.

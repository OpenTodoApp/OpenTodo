# Design review (D8)

Internal notes for this change only; nothing here is published, and no page of the website names another product.

The Habits screen, the Today strip and a habit's page were reviewed against the patterns of four leading habit trackers: two built around a grid of days per habit, one around large tap targets per habit, and one around a score that decays slowly. The review used the Storybook stories `Screens/Habits` (Screen, Empty, Today strip, Thread states) and `Screens/Habit history` in light and dark at 375 and 1280 px.

## What we keep from them

- **One row per habit with the recent days visible.** The grid trackers show the last days next to the title; our thread does the same with seven days, so a row answers "how is it going" without opening anything.
- **A slowly moving score instead of a streak headline.** The score-based tracker's half-life is the one D4 uses; the streak stays on the habit's page, not on the row.
- **Check-in from the list.** Every tracker checks in from the list in one tap; our check button and `Space` do too, with Undo instead of a confirmation.

## Where we differ, on purpose

- **No red.** Two of the four colour a missed day red or show a broken streak. Ours draws an empty circle and drops the line; two misses leave a thin line. Nothing reads as failure.
- **Shape before colour.** The grid trackers rely on fill colour alone; ours differs by shape (filled, half, dash, empty, ring) so it reads in high contrast, in greyscale and for colour-blind people, and each day is announced.
- **No celebration.** Confetti, badges and sounds on a check-in appear in three of the four. Ours is the existing 400 ms completion moment and a haptic tick, the end state at once under reduced motion.
- **Habits are tasks.** The others keep habits in a separate app area with their own reminders; ours are repeating tasks, so they move, sync, share and export like tasks, and Habits off leaves them as plain repeating tasks.

## Checked

- Every colour is a token (`bg-hue-solid`, `stroke-muted`, `stroke-faint`, `--border-color-strong`) and passes the axe gate in light and dark.
- At 375 px the thread moves under the title, so the row keeps its title readable; the strip wraps to two lines and folds the rest into "+N".
- Chrome above the list stays one title row (title and New habit), inside the interface budget.

## Follow-ups noted

- A per-habit colour picker (today the hue follows the project, else the id).
- Showing the week's start day in the thread when it is not Monday.

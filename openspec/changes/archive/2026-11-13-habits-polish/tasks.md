## 1. Data
- [x] 1.1 Additive task field `habit_color` in `internal/sync/ops.go` Schema, generated files regenerated
- [x] 1.2 `habitHue` reads `habit_color` first; the form's patch writes it
- [x] 1.3 Make it a habit gives a repeating task without a due date its first date

## 2. Today
- [x] 2.1 The strip as one quiet line: Habits link, rings that check in, titles that open the habit, "+N" link; no heading, count or fold
- [x] 2.2 Tests and story

## 3. Habits screen
- [x] 3.1 One-line rows with the full title in the tooltip and accessible name; the thread on its own line below 640 px
- [x] 3.2 A check button on every row, early check-in for a habit due later
- [x] 3.3 Rows open the habit page

## 4. Habit page and form
- [x] 4.1 `/habits/<id>` route and the habit page: facts, tiny version, numbers, Check in, history, menu
- [x] 4.2 The task page and the panel show the habit page for an open habit series; `?as=task` shows the task page
- [x] 4.3 One form for New habit, Make it a habit and Edit, with Colour and the "?" tooltips on Tiny version and After
- [x] 4.4 No task-series scope note on a habit

## 5. Finish
- [x] 5.1 Strings in every shipped locale, docs, changelog fragment
- [x] 5.2 Screenshots of Today, the Habits screen and the habit page at 375 and 1280 px, light and dark; visual baselines of the affected stories

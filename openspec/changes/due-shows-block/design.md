# Design: a timed due with an estimate reads as its block

## Decisions

- **D1 The range lives in the due's words.** `facetsOf` appends the end time to the due part when the due has a time and the task has an estimate. The task page's Do row, the panel's facet line and the phone card all read that part, so they agree with each other and with the calendar's block label (`12:00–13:45`).
- **D2 The end stays on the day.** Like the calendar (which draws a block to the end of its day), the end is capped at 23:59 rather than reading "23:30–01:30".
- **D3 No rename of Start.** Start is the defer date (`task.start`, "from Tue 20 Oct") across the app, the quick-add grammar, the API and six languages; renaming it is a larger decision than this bug. With the block in the Do row, the planned time is where the eye lands first. Flagged for the owner.
- **D4 List rows unchanged.** A row's time column shows the start time only; the range would not fit and the row already agrees on the start.

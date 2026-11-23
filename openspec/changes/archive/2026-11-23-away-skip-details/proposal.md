# Away: which tasks a period skips

## Why

#1901 (kiwikern, follow-up to #805): the Away dialog says how many occurrences of how many repeating tasks a period skips, but not which ones, so a time-sensitive task (a monthly tax report) can be skipped unnoticed.

## What Changes

- `planAway` (`web/src/lib/awayPlan.ts`) also returns one row per skipped series: id, title, occurrences skipped and its due date once they are (`next`, from the planner's own working copy). The planned changes are unchanged, so the Go twin and the shared fixture are unaffected.
- The dialog offers Show details beside its line when anything is skipped; the list (title order, scrolls when long) follows the dates and the scope as they change. Hide details closes it.
- Strings: "Show details", "Hide details", "{n} skipped" and "Due {date}" already exist in every locale.
- `docs/away.md` mentions it.

No new field, no new string, no op-log or API change, no new environment variable.

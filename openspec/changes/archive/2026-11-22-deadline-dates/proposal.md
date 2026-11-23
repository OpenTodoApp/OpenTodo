# Deadlines as dates

## Why

#1798 (decoy123): a task row shows its deadline as a countdown ("5d"), so in Today and Upcoming you can't read the date ("Nov 28") without opening the task. Some people plan by the date, not by the days left.

## What Changes

- A setting in **Settings › Appearance › Theme and density**, **Show deadlines as dates**, off by default. With it on, every task row shows the deadline's date in the user's date format, in the countdown's place, next to the same hourglass and in the same tone: neutral, amber in the last week, red on the day and after. In a list's time column, too narrow for a date, it moves to the row's other facts. Screen readers still hear the countdown. The task panel already shows the full date and is unchanged.
- It is a per-account choice, synced like **Show full task titles** and changed offline as an ordinary op.
- The settings search finds it.

## Out of scope

- The assistant's deadlines block and the task panel, which keep their wording.
- A per-list choice.

One additive `user_prefs` field (`deadline_dates`), two new strings in every locale, no route, no new environment variable.

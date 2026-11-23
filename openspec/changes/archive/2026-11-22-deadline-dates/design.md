# Design

## D1: A setting, the date in the countdown's place

`user_prefs.deadline_dates` is "on" or empty; an empty or unknown value reads as off and is never rewritten, as `full_titles`. `TaskRow` computes the countdown as before (`describeDeadline`, which also gives the tone) and, with the setting on, replaces only its label with `formatDate(deadline, 'compact')`: "Nov 28", with the year when it is another year, in the user's date format. The tone, the hourglass and every place that already shows the countdown keep working, because they all read the one value. A list's time column is too narrow for a date with a year or an ISO date, so with the setting on the deadline stays with the row's other facts instead. The accessible name keeps the countdown ("Deadline Sat, Oct 17, 3d"), so a passed deadline is said in words, not only by its red.

A setting rather than replacing the countdown: the countdown is what most people want at a glance and is specified in `deadlines`; the reporter asked for a choice.

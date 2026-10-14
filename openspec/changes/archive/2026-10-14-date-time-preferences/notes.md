# Notes

## 7.1 Smoke (2026-10-14)

Scripted with Playwright on a production build (`make build`, `./bin/opentodo`), Chromium, en-US locale, UTC.

Profile A, Settings → Preferences → Date and time: day-month, 24-hour, Sunday.
- The preview week strip starts on Sunday.
- Quick add `Smoke check 4/11 3pm` (numeric order from the date format) gives a row `4 Nov 15:00`.
- Task detail: the due date field shows `04/11/2026` and the due time `15:00`.
- A new comment's timestamp is on a 24-hour clock.
- The Week view starts on Sunday 2026-10-11.

Profile B, a second browser context signed into the same account:
- After the first sync the same row shows `4 Nov 15:00`.
- Settings shows day-month / 24h / Sunday.

Result: 8 of 8 checks passed.

## Visible changes with every preference on `system`

`system` keeps dates as the browser locale writes them and due times as their stored `HH:MM`. Timestamps that used `toLocaleString()` now go through `formatInstant` and drop their seconds (for example `Oct 14, 3:05 PM`), and the Day view title uses the short month.

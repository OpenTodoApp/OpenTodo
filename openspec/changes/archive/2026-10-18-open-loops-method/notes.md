# Notes

## Smoke on a built server (task 9.3), 2026-10-18

Run against `./bin/opentodo` with a fresh data directory, two browser contexts signed in as the same user (Playwright, Chromium):

- Device A picks **Open Loops first** in Settings → Account; device B's sidebar switches to Loop home, Inbox, Today, Next, Waiting, Review after sync. ✔
- Device B shows the Daily check in the Review marker's text alternative; after device A presses **Done for today**, device B's marker no longer names it. ✔
- Device B goes offline, opens the project walk and presses `r` on Garage; after reconnecting, device A's walk shows Garage as reviewed. ✔

`scripts/e2e-smoke.mjs` also passes with its Open Loops step (first mode, Loop home, triage from the Clarify tile, two walk cards, a daily focus, back to Lists only).

Not done in this environment:

- **Per-user stamps with a second member of a shared project in the browser.** Covered instead by `internal/sync` `TestReviewStampIsPersonal` (two accounts, one shared project, each member's stamp reaches only their own devices) and by the web walk tests.
- **A screen-reader pass** (VoiceOver or NVDA) over the Loop home and the walk: no screen reader is available here. The axe checks in the Loop home test and the Storybook a11y gate pass, and the live-region announcements are covered by component tests. A manual pass is still worth doing before release.

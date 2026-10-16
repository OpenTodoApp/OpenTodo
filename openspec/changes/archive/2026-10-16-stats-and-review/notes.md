# Notes: stats-and-review

## Integration (task 5.1)

A person with two browsers and a phone was not available, so the smoke test ran as the closest verifiable substitute: the production binary built from this branch, two browser contexts of one account ("laptop" at 1200 px, "phone" at 390 px) in headless Chromium (`/opt/pw-browsers`), and a local SMTP sink (a stdlib Python socket server accepting plain SMTP on 127.0.0.1) as the outgoing email relay (`OPENTODO_SMTP_HOST=127.0.0.1:<port>`, `OPENTODO_SMTP_SECURITY=none`). Results on 2026-10-16:

- Seeded through `/api/v1/sync`: completions this week and last, an overdue task, a recurring habit with three occurrence records and one skipped record, a project (Garage) with only completed tasks.
- Statistics on both profiles, for this week, last week and the last 4 weeks: identical numbers and per-day values on both (`{"completed":5,"created":0,"late":1,"slipped":1,"overdue":1}` this week; the skipped habit day is in no number; the three occurrence records count as three completions).
- Review on the laptop: Next actions listed Garage; "Add a next action" with "Buy shelf brackets" removed it from the step; "Finish review" showed the time. The phone profile then showed "Last review Fri, Oct 16, 12:18 PM" after sync.
- Digest: enabled for the current weekday and hour (UTC) through `PUT /api/v1/me/email-digest`; after a restart the first scheduler pass sent one `digest` message to the sink (subject "Your week in OpenTodo: 2 completed", last week's numbers equal to the Statistics screen's "Last week", the overdue task, the upcoming habit, "Last review: Fri 16 Oct", the `/review` link). A second restart sent nothing more that day.
- Docs screenshots `review` and `stats` were captured with `scripts/docs-screenshots.mjs` (two new shots) against the demo instance, in light and dark.

The scheduler scenarios ("sent once before 07:15", "relay down for an hour", "skipped after six hours", "no second send after restart", encrypted account) are pinned by `internal/digest/service_test.go` on a fake clock with the in-process SMTP server of `internal/mail/smtptest` behind a transport that can be switched "down".

## Decisions taken while implementing

- **Retry spacing.** Retrying at every 5-minute pass would hit the per-recipient limit of outgoing email (five an hour) after 25 minutes, so failed sends are retried at most every 15 minutes (`digest.RetryEvery`); spec and design say so.
- **Demo.** The `PUT` is on the demo deny list ("Email digest"), so a demo answers 403 `demo_restricted` before the handler; the `GET` reports `available: false` (no mailer on a demo). The spec's demo scenario says this.
- **Review link without a base URL.** The settings row stores the origin the user saved from (`email_digests.origin`); `OPENTODO_BASE_URL` wins when set.
- **`week_start: system` on the server** reads as Monday; the digest names the week it covers.
- **Next actions** lists projects where the user may add tasks (`canEditTasks`), offering Archive only where `canEditProject` allows it; a viewer's project is never listed.
- **Charts.** Per day for periods up to four weeks, per week and per weekday for 4 and 12 weeks (84 day bars are unreadable), per project always.
- **Help.** Settings cards carry no help link (settings-navigation), so the digest card has no `settings/email-digest` help id; the screens use help ids `review` and `stats`.
- **Icons.** `chart-column` and `clipboard-check` were added to the vendored Lucide set (`names.json`, regenerated `lucide.ts`).

## Visual baselines

Baselines are generated in the pinned Playwright image, not here. New stories: `screens-review-and-statistics--statistics-this-week`, `--statistics-four-weeks`, `--statistics-empty`, `--bar-chart`, `--weekly-review`, `--digest-on`, `--digest-change`, `--digest-unavailable`, `--digest-encrypted`, `--digest-offline`. Changed: `foundations-icons--all` (two icons), `screens-sidebar--default`, `--project-selected`, `--collapsed`, `--phone-drawer` and `screens-shell--list-only`, `--list-with-panel` (the Review and Statistics entries, and the "Review due" marker on the closed More group), `settings-navigation--overview-member` (the Notifications description), possibly `settings-navigation--section-page` and `--appearance-page` (the section list). The a11y gate passed for all of these in light and dark.

## Integration with multi-tenant-host

`multi-tenant-host` moved the background jobs into `internal/tenant`: the digest service is built there with outgoing email and started by `Tenant.StartJobs` (the `main.go` wiring is gone). In host mode the shared scheduler runs it as the `digest` kind, opening a tenant only when `digest.Service.NextDue` says a send, retry or give-up is due, and sends through the operator's outgoing email. The opt-in stays each user's on a hosted tenant; the `email-digest` spec says so in one sentence.

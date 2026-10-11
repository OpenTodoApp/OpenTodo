# Design: demo sandboxes

## Threat model

The demo is reachable by anyone. We assume visitors who: write offensive, illegal or spam content; try to make others see it (shared spaces, links, search engines); script requests to exhaust disk, memory or CPU; try to escalate to settings, other accounts or outbound requests; and crawlers or link-preview bots that follow every link. We do not defend against a visitor seeing their own content, nor against volumetric DDoS (that is the proxy's job).

## D1 One account per visitor, created on demand

`POST /api/v1/demo/sandbox` (only in demo mode, unauthenticated) creates a member account `sandbox-<random>@demo.invalid` with no password hash (password sign-in is impossible), a collaborator account `collab-<random>@demo.invalid` with no password and no session (it exists only so the shared project, assignments and mentions look real), seeds both through the op log exactly like today's demo seed, and answers with a session cookie. The hidden owner stays as in `demo-mode`. Sandbox accounts carry a `sandbox` marker in a side table (`demo_sandboxes`: user id, collaborator id, created_at, last_active_at, creator address hash) so cleanup and limits never touch other accounts. The existing role and scope checks give isolation for free: a sandbox can only read and write its personal scope and the project shared with its own collaborator; membership changes stay refused, so a sandbox can never share anything with another sandbox, and assignment and mentions only accept members of the project.

## D2 Creation needs a page token

The sign-in page receives a short-lived (10 min), single-use, HMAC-signed token in `GET /api/v1/auth/status` (`demo.token`). The sandbox POST must carry it and pass the existing same-origin check. Link previews, crawlers and naive scripts that do not run the page never create sandboxes. This is a speed bump, not a captcha; the limits below are the real bound.

## D3 Limits (defaults, overridable by optional variables)

| Limit | Default | On breach |
| --- | --- | --- |
| Live sandboxes | 500 (`OPENTODO_DEMO_MAX_SANDBOXES`) | delete the least recently active idle sandbox (idle > 15 min); if none, 503 `demo_busy` "The demo is busy, try again in a few minutes" |
| Sandboxes per address | 5 per hour (address hashed with a per-process salt, never stored in clear) | 429 `rate_limited` |
| Ops per sandbox | 600 per hour, 5,000 total | 429 `demo_limit` on sync and REST writes; the client shows a notice and keeps the queue |
| Field size | 4 KB for titles, names and comment bodies; 32 KB for notes | 400 `invalid_input` like other size limits |
| Database size | stop creating sandboxes above 1 GB (`OPENTODO_DEMO_MAX_DB_MB`), run cleanup at once | 503 `demo_busy` |

Existing rate limits (sign-in, comments 60/min) stay.

## D4 Expiry and cleanup

A sandbox is idle when its `last_active_at` (updated at most once a minute on authenticated requests) is older than 2 hours; it expires 24 hours after creation regardless. A cleanup job (jobs leader only, per `rolling-updates`) runs every 5 minutes and deletes expired sandboxes in batches: sessions, the two accounts, their scopes, ops, fields, notifications, activity, purge markers and sandbox row, in one transaction per sandbox. Because the accounts disappear, no purge markers are written; the open tab's next request gets 401 `demo_expired` and the app clears its local database and shows "Your demo sandbox has expired" with a button for a new one. The nightly 03:00 UTC reset deletes all sandboxes the same way, then runs `VACUUM` (outside a transaction, while holding the jobs lock) so deleted rows free disk space. On first start of this version the old shared demo account and its collaborator are deleted.

## D5 Nothing worth posting

- `X-Robots-Tag: noindex, nofollow` on every response in demo mode, and `<meta name="robots" content="noindex">` in the served page.
- Links in visitor content render with `rel="nofollow ugc noopener noreferrer"` and `target="_blank"` (comments and notes); the markdown renderer already drops raw HTML and non-http(s)/mailto links.
- No public page shows sandbox content; there is no share link, no export URL without a session, and no notification leaves the sandbox.

## D6 Sign-in and banner

`auth/status.demo` drops `email`/`password` and gains `token`, `sandboxHours` (2 idle / 24 max) and `resetsAt`. "Try the demo" posts for a sandbox and reloads into the app. The banner reads "Demo — this sandbox is private to you and is deleted after 2 hours of inactivity. Don't store anything personal." A visitor who returns within the window keeps their sandbox (the session cookie), otherwise gets a new one.

## D7 Rolling updates and multiple processes

Sandbox creation and the write budget work in every process (counters live in SQLite rows, not memory: `demo_sandboxes.ops_hour_start`, `ops_hour_count`, `ops_total`). The cleanup job and the nightly reset run only in the jobs leader.

## Size impact

Estimated +20 KB binary (sandbox lifecycle, cleanup), +1 KB gzipped web (expiry screen). No dependency. Each sandbox seed is about 400 ops (~150 KB of rows); 500 live sandboxes ≈ 75 MB before VACUUM.

## Alternatives considered

- **Hourly reset of the shared account.** Still shows one visitor's content to others for up to an hour. Rejected.
- **Moderation or content filters.** Word lists are easy to evade and hard to get right across languages; isolation removes the audience instead. Rejected.
- **A read-only demo.** Safe, but visitors cannot feel quick add, the board or offline sync, which is the point. Rejected.
- **Captcha.** Needs a third-party service (forbidden by AGENTS.md) or a weak home-made one. The page token plus limits is enough for this threat model.

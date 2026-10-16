# Implementation notes

## Status (2026-10-16)

Every task is done on `feat/multi-tenant-host`. Phases 1 and 3–6 shipped together in one change rather than as separate changes (design "Migration Plan" allowed either). Phase 2, outgoing email, had already shipped as the `outgoing-email` change.

## Adaptations to the current code

The design was written before several changes landed. What changed against it:

- **Outgoing email.** D6 was implemented by `outgoing-email` in `internal/mail` (not `internal/email`, which is email to task). This change's `specs/outgoing-email` and `specs/account-access` deltas described what that change already archived, under other requirement names, so they were removed here instead of being archived a second time. A host passes the operator's `OPENTODO_SMTP_*` to every tenant's `mail.Service`; the owner's `/api/v1/settings/smtp*` routes answer `403 host_managed`. The mail limits (5 per address and kind per hour, 100 per hour) are per tenant.
- **Background jobs.** `cmd/opentodo` already elected one process for the jobs (`runJobsWhenLeader` with `store.LockJobs`, rolling updates). A self-hosted server keeps it unchanged around `Tenant.StartJobs`. A host uses the same election on its root directory for the shared scheduler, and every host process closes its own idle tenants.
- **Push.** The reminder pass (`push.Service.Tick`) is reused as is; `NextDue` reuses its candidate query and eligibility check (split out of `dueReminders`), so the index never names a reminder the pass would skip. VAPID keys stay per tenant (they are in the archive). The VAPID subject is the host's address.
- **Backups.** `backup.Service.RunIfDue` is one pass of the existing scheduler; `NextRun` gives the index entry. The `OPENTODO_BACKUP_*` presets are seeded into each tenant when it first opens, with the tenant's name appended to the local folder, S3 prefix or WebDAV URL, so tenants never share archives or prune each other's. Restores from the web app are refused on a host (`/api/v1/backups*` is operator-owned); `Restart` closes the tenant so a pending restore would apply on its next open.
- **Housekeeping.** Trash retention (`sync.RetentionPass`), audit pruning, expired pending sign-ups, the webhook delivery log and the notification sweep run as one `housekeeping` kind, due at the earliest of their deadlines (`NextRetention`, `NextPrune`, `NextSignupExpiry`, webhook `NextPrune`). The notification sweep has no deadline of its own; it also runs whenever a tenant opens, as it did at a self-hosted server's start.
- **Calendar feeds.** `calendar-feeds` landed after the design; its fetches are a `calendars` kind (`calfeed.Store.NextFetch`).
- **Email to task.** One operator IMAP mailbox cannot serve many tenants, so email capture is off on a host.
- **Attachment limits and the webhook network policy** were not in D4's list but are operator concerns on a shared host (disk and the host's private network): their writes answer `403 host_managed`, and webhook private targets are forced off on every open.
- **The demo machinery.** D5 said the limits would generalise the demo budgets. The demo guard refuses a whole batch (`ErrWriteLimit`), which blocks a device's outbox; the spec asks for per-operation refusals. A new `sync.Quota` hook refuses single ops with reasons `limit_storage`, `limit_ops_hour` and `limit_ops_total`, reported in `rejected`, and the server sends no value back for them. The demo guard is unchanged.

## Decisions taken while implementing

- **`tenant.Open(ctx, cfg, Options)`** instead of `Open(dir, hostCfg)`: the tenant needs the whole resolved configuration (a host derives one per tenant: data directory, base URL, setup token, import size, backup presets) and options for the restart hook, the shared web handler and the hosted settings.
- **Registry**: `<OPENTODO_DATA_DIR>/host.db` with `tenants(name, state, created_at, updated_at, deleted_at, limits JSON, setup_token, last_error)` and `due(tenant, kind, at)`; tenants live in `<OPENTODO_DATA_DIR>/tenants/<name>`. Host mode refuses a directory that holds `opentodo.db`.
- **Defaults** (design open question): idle close after 10 minutes, at most 500 open tenants. Measured with `go test`: about 130 KiB of Go heap per open tenant (SQLite's page cache included, modernc runs in Go) and about 60 ms for a cold open plus a password sign-in on the CI container, so 500 open tenants stay near 65 MB.
- **Open failures**: a tenant that fails to open answers `503 unavailable` and is not retried for one minute; the error is stored as `lastError` and shown by the operator interface. Registry lookups on the request path are cached for 2 seconds; operator actions in the same process invalidate them.
- **Scheduler**: sleeps until the earliest due entry (at least 1 s, at most 30 s, the push tick); a committed write in an open tenant marks it for a refresh (debounced to 1 s); every 30 s all open tenants refresh; a pass runs at most 64 tenants, 4 at a time. Work still due after it ran (all sends failed transiently) is retried 30 s later; a tenant that cannot be opened is retried a minute later.
- **First account**: a new empty tenant gets a random setup token (owner-bootstrap), returned once by the operator interface with a `setupUrl` (`https://<name>.<host>/?setup=<token>`); the sign-in screen fills the token in from `?setup=`.
- **Operator interface** on its own listener (`OPENTODO_HOST_OPERATOR_ADDR`, default `127.0.0.1:8081`) rather than a reserved host name: tenant host names cannot reach it at all, and it can stay on a private network. Bearer token compared in constant time on SHA-256 digests; 401 for anything else, before routing. Routes: `GET/POST /operator/v1/tenants`, `GET/PATCH/DELETE /operator/v1/tenants/{name}`, `PUT/GET /operator/v1/tenants/{name}/archive` (create from / export as archive), `POST …/suspend`, `POST …/resume`.
- **Names**: 1–63 lowercase letters, digits and inner hyphens; `www`, `api`, `app`, `admin`, `operator`, `mail` and a few other service names are reserved. A deleted name is a tombstone for 30 days.
- **Limits** (`OPENTODO_HOST_LIMITS` defaults, per-tenant overrides through `PATCH`, applied when the tenant next opens, so `PATCH` closes it): storage counts used pages (`page_count − freelist_count`), so emptying the Trash frees room without a VACUUM; setting `deleted_at` stays allowed when full. The op counters are seeded from the op log when a tenant opens and kept in memory (sliding hour in one-minute buckets), so a batch never scans the log. Requests per minute answer `429 limit_requests`, imports `413 limit_import`, new accounts `403 limit_members` (registration, sign-up confirmation, project invite links, single sign-on; deactivated accounts do not count).
- **Client**: refusals with a `limit_` reason are held in the `heldOps` meta row instead of being forgotten, the row stays as edited, the sync status shows "Server limit · N waiting" with the reason, and held ops are re-queued at most once a minute. No IndexedDB schema change.
- **Owner download**: `GET /api/v1/export/archive` (hosted tenants only), owner with a fresh session or a full token; read and agent tokens are refused because the archive holds every account's credentials. Audited as `export.requested` with format `archive`. Also on the demo deny list, although a demo can never be a host.
- **Settings in the app**: `auth/status` carries `hosted: true`; Settings hides Backups, Attachments, Outgoing email and Single sign-on, shows "Download your data" in Server, and renders the owner-only parts of Webhooks, the assistant and AI assistants as for a member. Search follows (`hosted: 'managed' | 'only'` on index rows).

## Substitutes for what cannot run here

- **Host names**: tests use `httptest` servers and set the request's `Host` header (`alice.example.test`); no DNS or certificates are involved.
- **Time**: the pool, the limits and the scheduler take an injectable clock; the idle close, the hour window, the tombstone grace and the 10,000-tenant hour run on a fake clock. The reminder test moves the reminder's `fire_at` to the real past because the push pass reads the real clock.
- **Push service**: an `httptest` server stands in for the browser push service (`tenant.Options.PushOptions` allows plain http in tests only).
- **Failing migration**: a tenant whose `opentodo.db` is not a database stands in for a migration that fails.
- **Many machines / rolling updates**: the host reuses `runJobsWhenLeader`, already covered by `cmd/opentodo/jobs_test.go`; two host processes were not run side by side.

## Package-level variables (task 1.1)

Reviewed with `go/ast` over `internal/` (tests, `host`, `tenant` and the test servers excluded): 192 package-level variables besides 184 error values (`errors.New`, `fmt.Errorf`) and compiled regular expressions, which are immutable. The design's "about 40" counted only the non-table ones. None holds per-server state that would leak between tenants; nothing had to move.

| Variable | Verdict |
| --- | --- |
| `httpapi.trustedProxies` (atomic pointer) | The only process-wide mutable value. Set by every `httpapi.New` from `OPENTODO_TRUSTED_PROXIES`, which a host passes unchanged to every tenant: the proxy topology is the operator's. Kept process-wide. |
| `httpapi.heartbeatInterval`, `httpapi.resetMinDuration`, `cli.flagSetHook` | Test tuning hooks, never written outside tests. Keep. |
| `agenttools.registry`, `cli.commands` | Filled by `init`, read-only afterwards. Keep. |
| `cli.Version`, `cli.kernel32`, `cli.procSetConsoleMode` | The `ot` client only. Keep. |
| `store.migrations`, `web.dist`, `mail.templateFS`, `cli.schemaFS`, `quickadd.vocabJSON`, `importer.nlpVocabJSON` | Embedded files, read-only. Keep. |
| `mail.templates`, `quickadd.Vocabularies`, `importer.nlpVocabs`, `webauthn.cborDecoder`, `importer.sqliteMagic`, the CalDAV property names `httpapi.p*`, `httpapi.reportSet`, `httpapi.privilegesReadOnly` | Computed once at start-up, read-only. Keep. |
| `auth.b32`, `email.secretEncoding`, `email.secretLen`, `email.wordDecoder`, `caldav.textEscaper`, `importer.diacritics`, `agenttools.nullRaw`, `mcp.nullID`, `email.maxLinkLen` | Stateless encoders and constants. Keep. |
| `webhook.ValidateURL`, `webhook.IsDenied`, `webhook.ErrPrivateTarget`, `webhook.ErrBadURL`, `assistant.ErrPrivateTarget`, `calfeed.ErrInvalid`, `agenttools.ErrTaskNotFound` | Aliases of functions and errors. Keep. |
| The 131 literal tables below | Immutable lookup tables (schemas, names, vocabularies, defaults). Keep. |
| `cmd/opentodo.restartRequested`, `cmd/opentodo.version` | Single-tenant process only; a host closes the tenant instead of restarting. |

Literal tables:

| File | Variables |
| --- | --- |
| `internal/activity/activity.go` | `Opaque`, `counted` |
| `internal/activity/feed.go` | `FeedKinds` |
| `internal/agenttools/read.go` | `completedArg`, `cursorProp`, `limitProp`, `timezoneProp` |
| `internal/agenttools/skills.go` | `Skills`, `readTools` |
| `internal/agenttools/write.go` | `descProp`, `dueProp`, `estimateProp`, `idsProp`, `labelsProp`, `priorityProp`, `recurProp`, `requestIDProp`, `timezoneWrite`, `titleProp` |
| `internal/assistant/config.go` | `AnthropicModels`, `ProviderNames` |
| `internal/assistant/loop.go` | `views` |
| `internal/assistant/member.go` | `MemberProviders` |
| `internal/assistant/schema.go` | `droppedKeywords`, `supportedFormats` |
| `internal/assistant/service.go` | `pingTool` |
| `internal/audit/events.go` | `Names`, `PersonalNames`, `allowedDetailKeys` |
| `internal/auth/users.go` | `Actions` |
| `internal/backup/archive.go` | `ExtraFiles` |
| `internal/caldav/dav.go` | `prefixes` |
| `internal/calfeed/expand.go` | `unsupportedParts`, `weekdays` |
| `internal/calfeed/windows_zones.go` | `windowsZones` |
| `internal/cli/app.go` | `commandHelp` |
| `internal/cli/client.go` | `notPermittedCodes` |
| `internal/cli/cmd_projects.go` | `palette` |
| `internal/cli/cmd_tokens.go` | `tokenScopes` |
| `internal/cli/commands.go` | `addOnlyFields`, `cmdSpecs`, `errorCodes`, `exitCodes`, `globalFlagSpecs`, `idemFlag`, `limitFlag`, `refsArg`, `taskFields`, `yesFlag` |
| `internal/cli/dates.go` | `weekdays` |
| `internal/cli/gate.go` | `agentTaskFields` |
| `internal/config/backup.go` | `weekdays` |
| `internal/config/proxies.go` | `CloudflareRanges` |
| `internal/demo/demo.go` | `legacyEmails` |
| `internal/demo/seed.go` | `labels`, `projects`, `sections`, `tasks`, `views` |
| `internal/e2ee/e2ee.go` | `ContentFields` |
| `internal/email/route.go` | `routeHeaders` |
| `internal/email/text.go` | `cp1252`, `reHidden` |
| `internal/filter/filter.go` | `noKeywords`, `simpleKeywords`, `single`, `weekdays` |
| `internal/httpapi/agent_rest.go` | `taskCreateFields` |
| `internal/httpapi/assistant.go` | `consentFields` |
| `internal/httpapi/attachments.go` | `inlineTypes` |
| `internal/httpapi/caldav_dav.go` | `allpropSkip` |
| `internal/httpapi/caldav_write.go` | `calendarSettable` |
| `internal/httpapi/demo.go` | `demoRules` |
| `internal/httpapi/hosted.go` | `hostRules` |
| `internal/httpapi/idempotency.go` | `volatileOnCreate` |
| `internal/httpapi/publiclinks.go` | `publicTaskFields` |
| `internal/httpapi/server.go` | `labelPalette` |
| `internal/httpapi/views.go` | `viewDefaults`, `viewEnumSets`, `viewGroupBy`, `viewKinds`, `viewSortBy`, `viewSortDir` |
| `internal/importer/importer.go` | `Profiles`, `formatAliases` |
| `internal/importer/plan.go` | `palette` |
| `internal/importer/profile_csv.go` | `csvColumns`, `csvUnsupported` |
| `internal/importer/profile_json.go` | `recurrenceKeys`, `reminderKeys` |
| `internal/importer/profile_linear.go` | `linearDropped`, `linearPriority` |
| `internal/importer/profile_todoist.go` | `todoistColumns` |
| `internal/importer/schedule.go` | `dayCodes`, `spellings`, `units` |
| `internal/importer/todoistdate.go` | `englishWeekdays`, `everyWords` |
| `internal/importer/values.go` | `floatingLayouts`, `zonedLayouts` |
| `internal/mail/config.go` | `envVariable` |
| `internal/mail/message.go` | `Kinds`, `Languages`, `carriesContent`, `roleNames`, `someone`, `units` |
| `internal/mcp/server.go` | `ProtocolVersions` |
| `internal/oidc/jwt.go` | `supportedAlgs` |
| `internal/outbound/outbound.go` | `deniedPrefixes` |
| `internal/quickadd/recurrence.go` | `ordinalEN`, `weekdayEN` |
| `internal/quickadd/reminders.go` | `unitMinutes` |
| `internal/quickadd/vocab.go` | `Bundled`, `fold` |
| `internal/recurrence/recurrence.go` | `unitNames`, `weekdayAliases`, `weekdayNames`, `wordOrdinals` |
| `internal/recurrence/rrule.go` | `freqOf`, `rruleDays` |
| `internal/sync/attachments.go` | `attachmentImmutable` |
| `internal/sync/members.go` | `roleOrder` |
| `internal/sync/ops.go` | `DocFields`, `Plural`, `Schema` |
| `internal/sync/scope.go` | `projectChild` |
| `internal/sync/trash.go` | `Purgeable` |
| `internal/webauthn/webauthn.go` | `SupportedAlgorithms` |
| `internal/webhook/events.go` | `Events` |
| `internal/webhook/worker.go` | `RetrySchedule` |

## Measurements

- Binary (`CGO_ENABLED=0 go build -trimpath -ldflags="-s -w"`): 25,374,882 → 25,591,970 bytes (+217,088, +0.9 %). No new dependency.
- A self-hosted server's memory and start-up are unchanged (same services, same goroutines).

## Integration with custom-fields and stats-and-review

Merged onto the branch carrying `custom-fields` and `stats-and-review`. The weekly digest that `stats-and-review` started in `cmd/opentodo/main.go` is built in `internal/tenant` beside outgoing email (`Tenant.Mail`, `Tenant.Digest`) and started by `Tenant.StartJobs` on a self-hosted server. On a host it is a new scheduler kind, `digest`: `computeDue` asks `digest.Service.NextDue` (the earliest send, retry or end of the six-hour window among enabled rows, nothing while outgoing email is off) and `runDue` runs one `Tick`. Tenants get the host's clock (`tenant.Options.Now`). The digest opt-in (`/api/v1/me/email-digest`) is per user, so it is not in `hostRules`; without the operator's email it reports `available: false` and the `PUT` answers `smtp_disabled`, naming the operator. Saving the opt-in writes no op, so the index picks it up at the next 30-second refresh of open tenants or when the tenant closes. Custom fields (`/api/v1/fields`) are tenant data and stay out of `hostRules` and the demo deny list. Tests: `TestDigestInClosedTenant`, `TestDigestWithoutOperatorEmail` (internal/host), `TestStartJobsRunsDigest` (internal/tenant), `TestDueAt` (internal/digest).

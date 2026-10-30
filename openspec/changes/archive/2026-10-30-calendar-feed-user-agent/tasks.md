# Tasks

## 1. Fetch

- [x] 1.1 `calfeed.BrowserUserAgent` constant with its reason, a once-only retry on 400/403/406 in `Fetcher.Fetch`, `Result.BrowserAgent`; verify `go test ./internal/calfeed -run TestFetchBrowserRetry` (400/403/406 retried once with the browser agent and the error kept, 401/404/500 not retried, a remembered subscription not retried)
- [x] 1.2 Migration `0050_calendar_feed_browser_agent.sql`, `Subscription.BrowserAgent` read with the subscription, recorded on success and cleared on a URL change; verify `go test ./internal/calfeed -run TestFetchRetriesWithBrowserAgent` (first poll succeeds via the retry, second poll sends the browser agent first) and `go test ./...`

## 2. Docs

- [x] 2.1 Troubleshooting note for Exchange on-premises in `docs/calendar-feeds.md` and a CHANGELOG "Fixed" entry; verify `make docs-check`

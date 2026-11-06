# The share target needs Sec-Fetch-Site

## Why

The threat model (`docs/security/threat-model.md`, "Web client", hardening item 6.8 of `external-security-review`) lists a gap: the service worker stores a `POST /share` that carries no `Sec-Fetch-Site` header, as a concession to older browsers. The header is what tells the system share sheet and the app's own pages apart from a form on another site, so a request without it cannot be placed. Every browser that can deliver a share sheet's `POST` to an installed web app also sends the header, so the concession serves no real share.

## What Changes

- The service worker stores a `POST /share` only when `Sec-Fetch-Site` is `none` or `same-origin` (and the share is within 100 MB), as before; a request without the header is no longer stored.
- Such a request opens the capture screen at `/share?files=unverified`, which shows one note: nothing from the share was kept because the browser did not say where it came from; update the browser and share again. One new message in the six catalogues.
- Docs: `docs/capture.md` and the threat model's web client section, whose gap line goes.

Not **BREAKING**; no op, route or environment variable changes. The native shells are unaffected: they open `/share?…` with a `GET` and hand files over by message, never by `POST`.

Out of scope: the server's `POST /share` fallback (`internal/httpapi/share.go`), which runs before the service worker is active. It stores nothing and only carries the title, text and link into the capture screen's address, which any link to `/share?title=…` can already do; the person still has to press Save.

ROADMAP: hardening of a shipped feature (`share-capture`); advances `external-security-review` task 6.8.

## Capabilities

### Modified Capabilities

- `share-capture`: "Share target accepts only the share sheet and the app" no longer stores a request without `Sec-Fetch-Site` and explains it.

## Impact

- `web/src/lib/shareInbox.ts` (`shareRequestVerdict`), `web/src/sw.ts`, `web/src/app/ShareCapture.tsx`, `web/src/locales/*.json`.
- Tests: `web/src/lib/shareInbox.test.ts`, `web/src/app/shareCaptureFiles.test.tsx`.
- Docs: `docs/capture.md`, `docs/security/threat-model.md`; CHANGELOG `### Security`.
- Bundle: one message and a few bytes, in the capture screen and the service worker.

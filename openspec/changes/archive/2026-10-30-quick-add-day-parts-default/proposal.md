# Quick-add parse follows the Day parts preference

## Why

`POST /api/v1/quick-add/parse` reads the part phrases (`tomorrow morning`, `this afternoon`) only when the request sends `day_parts: true`, so a client that does not know the account's preference, such as the browser extension's Quick save, never reads them even for someone who turned Group by day part on. The owner decided (DECISIONS.md, 2026-10-30) that the route should default to the account's preference.

## What Changes

- `POST /api/v1/quick-add/parse` without `day_parts` uses the signed-in account's Day parts preference (`user_prefs.day_parts`); an explicit `day_parts` (true or false) still wins.
- The browser extension, which never sends `day_parts`, now previews and saves part phrases while the account's preference is on. No extension change.
- `docs/api.md`, `docs/day-parts.md` and `docs/capture.md` describe the new default.

Not **BREAKING**: no op field, no new route, no environment variable. A client that sent `day_parts` keeps its behaviour; one that omitted it and relied on the phrases never being read now follows the account's choice, which is what the app itself does.

Out of scope:
- Any change to the grammar or the shared vectors.
- The CLI, which parses locally with the preference from `GET /api/v1/me` already.

Advances the `day-parts` item of ROADMAP.md (follow-up).

## Capabilities

### Modified Capabilities
- `natural-language-capture`: the parse route's `day_parts` default is the account's preference instead of false.

## Impact

`internal/httpapi/quickadd.go` (the request field becomes optional; the account data reads the preference), its tests, docs. No dependency, no size change.

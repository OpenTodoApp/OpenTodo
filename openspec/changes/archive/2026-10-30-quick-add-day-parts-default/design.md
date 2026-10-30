# Design

## D1. Absent means the preference

`parseRequest.DayParts` becomes `*bool`. `parseAccount`, which already reads `user_prefs/me` for language, date order and week start, also sets `ctx.DayParts` from `day_parts == "on"`; the handler overrides it only when the body carries the field. Nothing new is read and no request costs more.

## D2. Explicit value wins

`day_parts: false` still turns the phrases off for an account with the preference on, so a client can keep a literal line (as the app does when the user turned parsing of parts off on purpose). `true` still turns them on for an account without the preference.

## Data model

None: `user_prefs.day_parts` already exists; no op field, no migration. No dependency; binary and memory unchanged.

## Interface

No screen changes.

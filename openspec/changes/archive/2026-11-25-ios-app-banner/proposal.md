# Proposal

## Why

A task's link in a calendar event (`<base URL>/task/<id>`, written by the calendar feed and by calendar sync) opens Safari on an iPhone, never the OpenTodo app (issue #1777). iOS hands a web link to an app only through universal links, and those need every domain written into the app's signed entitlement at build time. A self-hosted server's domain is not known then, so universal links cannot cover it (the same finding as `app-sso-system-browser` design). The owner chose, on 2026-11-25, Safari's Smart App Banner, on by default: one tag in the page, no Apple account change, no request from the server.

## What Changes

- The page served for `/task/<id>` carries `<meta name="apple-itunes-app" content="app-id=6832200428, app-argument=<base URL>/task/<id>">`. Safari on an iPhone or iPad with the app installed shows a banner with **Open**, which opens the app at that task. Without the app, the banner offers it in the App Store. Other browsers and other platforms ignore the tag.
- The server adds it to the page it sends, and the service worker adds the same tag to the page it serves from its cache. No other page gets it.
- The iPhone app opens such an address only when its scheme, host and port are the configured server's. Any other host is ignored.
- Without a configured base URL, the banner carries no argument and opens the app at its start. Feeds have no task links then anyway.

No new setting, environment variable, route or op field. Not **BREAKING**.

## Out of scope

- Universal links (one tap from the calendar). They need an `applinks:` domain in the entitlement, and a self-hosted domain cannot be one. A redirect domain run by the project was weighed and not chosen.
- `opentodo://` links in feeds, which break in other calendar apps and on a Mac.
- Android, which has no Smart App Banner, and pages other than a task's.

Advances the ROADMAP row `ios-shell` and closes #1777.

## Capabilities

- `native-shells`: ADDED "A task's page offers the iPhone app".

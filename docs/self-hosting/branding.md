---
title: Branding
summary: Give your server its own name and logo - in the browser tab, the installed app's icon, the sign-in screen and the sidebar - while the footer says it is powered by OpenTodo.
audience: admin
specs: []
screens: []
order: 48
---
# Branding

An OpenTodo server can carry its owner's name and logo instead of the project's: for a family, a club or a company that runs it for its people. The owner sets both in **Settings → Server → Branding**.

## Name

The **Name** (up to 40 characters) replaces "OpenTodo" wherever the app named itself:

- the browser tab ("Today – Acme Tasks"),
- the installed app's name on the home screen (from the web app manifest),
- the sign-in, invitation and password-reset screens, the share-capture screen, the sidebar and the workspace control.

Clear the field and save to get "OpenTodo" back.

## Logo

Choose one square **PNG or JPEG** of at least 192 pixels on each side (at most 4096, and at most 2 MB). The server crops the centre square and renders every size it needs, so you upload once:

| Size | Used as |
| --- | --- |
| 32 px | the favicon in the browser tab |
| 180 px | the Apple touch icon (Add to Home Screen on iPhone and iPad) |
| 192 and 512 px | the installed app's icons (the web app manifest) |
| 512 px, maskable | the adaptive icon Android launchers mask; the logo sits at 80 percent on its own edge colour |
| 24 and 32 px in the app | the sidebar rail, the sign-in card and the other screens that showed the mark |

The files live under `<data>/branding/` and are part of your backups. Every address carries the logo's version, so browsers cache it for a year and still pick up a new logo at once. **Remove logo** brings OpenTodo's own icons back.

Browsers and phones keep an installed app's icon until the app is reinstalled or the manifest is refreshed; a new logo may take a while to appear on a home screen.

## What stays

- The sign-in screen's footer reads **Powered by OpenTodo <version> · AGPL-3.0 · no tracking, no telemetry** on a branded server.
- **Settings → About**, the source link and the documentation are unchanged.
- Colours, the accent and the typeface are each person's choice under **Settings → Appearance**; branding does not change them.

## Notes for operators

- Both settings need the owner and a connection; a demo instance refuses them like every server setting. On a hosted service each tenant's owner brands their own server.
- Changes are recorded in the [audit log](../settings-server.md#server) as `settings.changed` (`branding.name`, `branding.logo`); the name itself is recorded, the image is not.
- Routes: `GET`/`PUT /api/v1/settings/branding`, `PUT`/`DELETE /api/v1/settings/branding/logo`, the public `/branding/logo-<size>.png`; `GET /api/v1/auth/status` carries `branding`. See the [API](../api.md#instance-branding).

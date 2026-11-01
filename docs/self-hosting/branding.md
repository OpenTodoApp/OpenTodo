---
title: Branding
summary: Give your server its own name, logo and themes - in the tab, the app icon, the sign-in screen, the sidebar and a default look for everyone - while the footer says it is powered by OpenTodo.
audience: admin
specs: [instance-branding, themes]
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

## Themes

Below the logo, the owner chooses how the server looks for people who have not chosen a theme, and which themes the server offers to everyone.

**Default theme** has a **Light** and a **Dark** list: OpenTodo's theme, the built-in themes and the server themes of that kind, each with its colours. Whoever has not chosen a theme for a side sees the default you choose; a person's own choice always wins, and nothing is written to anyone's data, so changing the default later reaches everyone who still follows it. Choosing OpenTodo Light or OpenTodo Dark clears the default.

**Server themes** holds up to 20 themes everyone can choose, or customise a copy of; only you can change or remove them:

- **Add from file** takes a `.opentodo-theme.json` (a theme exported from the [editor](../themes.md#theme-files)); it is checked on your device first, then on the server (at most 16 KB).
- **Offer one of my themes** copies one of your own themes to the server. The copy is independent: changing your theme later does not change it.
- **Remove** stops offering a theme. If it was a default, that side goes back to OpenTodo's theme; people who chose it see their side's default and keep their choice.

A server theme whose colours fail some contrast pairs is marked **Low contrast · n**, and making it a default asks first, listing the pairs. At 20 themes, adding says *The server has 20 themes; remove one to add another.* Offline, the card shows the last values read, read-only. There is no environment variable for the default theme: a theme is chosen by looking at it.

The sign-in, invitation and password-reset screens, emails, the install splash and the icons keep OpenTodo's neutral look; branding covers them with the name and logo.

## What stays

- The sign-in screen's footer reads **Powered by OpenTodo <version> · AGPL-3.0 · no tracking, no telemetry** on a branded server.
- **Settings → About**, the source link and the documentation are unchanged.
- Colours, the accent and the typeface stay each person's choice under **Settings → Appearance**; the server's default theme only applies while a person has not chosen one.

## Notes for operators

- Both settings need the owner and a connection; a demo instance refuses them like every server setting. On a hosted service each tenant's owner brands their own server.
- Changes are recorded in the [audit log](../settings-server.md#server) as `settings.changed` (`branding.name`, `branding.logo`, `themes.default.light`, `themes.default.dark`, `themes.instance`); the name itself is recorded, the image and the theme documents are not (only their ids).
- Routes: `GET`/`PUT /api/v1/settings/branding`, `PUT`/`DELETE /api/v1/settings/branding/logo`, the public `/branding/logo-<size>.png`; `GET /api/v1/auth/status` carries `branding`. See the [API](../api.md#instance-branding). The themes: `GET /api/v1/themes/instance` for every signed-in person, `PUT /api/v1/settings/themes/default` and `PUT`/`DELETE /api/v1/settings/themes/instance/{id}` for the owner, refused on a demo instance; see [Server themes](../api.md#server-themes). They are server settings, so they are in your backups, and each tenant of a hosted service has its own.

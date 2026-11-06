---
title: Add a language
summary: Every file a new interface language touches, from the catalog to emails, push texts, the extension and the Android app, and who reviews it.
audience: developer
section: Contributing
specs: []
screens: []
order: 5
---
# Add a language

The app ships in seven languages. A new one is a catalog plus a handful of small tables, and a speaker of the language who reviews it. **Machine translation is not accepted.** How messages are written is in [Translating OpenTodo](../translating.md).

## Before you start

Open an issue or a discussion naming the language and who will review it. Until it is listed, a catalog can sit in the repository unfinished: the check only prints how far it is ("pl: 412 of 3550").

## The files

| What | Where |
| --- | --- |
| The interface catalog | `web/src/locales/<code>.json`: every key of `web/src/locales/messages.json`, translated |
| The language list | `{ code, name }` in `SHIPPED`, `web/src/locales/index.ts`, with the name in the language itself |
| Browser tags that pick it | `web/src/lib/i18n/locale.ts`, only when the language has script or region variants (as Chinese does) |
| Notification texts of the service worker | the table in `web/public/push-sw.js` |
| The browser extension | `extension/_locales/<code>/messages.json` |
| The Android app | `mobile/android/app/src/main/res/values-<code>/strings.xml` |
| Emails | `internal/mail/templates/*.<code>.txt`, and `<code>` in `mail.Languages` |
| Delivery channel messages | the rows in `internal/channels/messages.go` |
| The docs | the glossary column in [Translating OpenTodo](../translating.md#glossary), and the list in [Language](../language.md) |

Quick add understands dates and priorities in a language only with a vocabulary in `web/src/lib/nlp/vocab/`. That is a separate contribution; without it, quick add keeps English.

## Check it

```sh
node scripts/i18n/extract.mjs --write   # after any change to English messages
make i18n-check                          # complete catalogs, placeholders, plurals, Settings paths
cd web && npm test -- i18n
go test ./internal/mail/... ./internal/channels/...
```

Use the plural categories of your language (`one`/`other`, or only `other` for languages without plurals), keep every placeholder and tag, and use `’` rather than `'` in translations.

## In the pull request

- Name the reviewer: a speaker of the language who reads every entry, now and for later catalog changes.
- Add the language to the changelog: a file `changelog.d/Added/<language>.md` with its entry ([changelog.d/README.md](../../changelog.d/README.md)).

# User documentation: a docs site and help inside the app

## Why

OpenTodo has 55,000 words of documentation, but almost all of it is reference material for operators and integrators (API, sync internals, CalDAV, backups). Someone who just wants to use the app finds no guide to projects, boards, sharing, views, time blocking, offline use, passkeys or installing the PWA. The docs are only readable as Markdown on GitHub, there is no search, and the app itself links to a single file. People arriving from the launch try the demo, get stuck, and have nowhere to look. Every self-hosted user also runs a specific version, while GitHub always shows `main`.

## What Changes

- **One source:** `docs/` stays the only place documentation is written. Each page gets a short front matter block (title, summary, audience, the specs it covers, the app screens it explains). A build step turns it into the docs website and the in-app help, and CI fails when the generated output is stale, a link is broken, an image lacks alt text or a capability in `openspec/specs/` has no page.
- **A user guide** written for people, not operators: getting started, tasks and projects, views, sections and boards, labels and filters, recurring tasks and reminders, time blocking, sharing and comments, notifications, offline and sync, installing the app on each platform, keyboard shortcuts, account security (passkeys, two-factor, sessions), import and export, trash and history, settings, troubleshooting and FAQ. The keyboard reference is generated from the same table as the `?` overlay so the two never disagree.
- **Docs on the website** at `opentodo.pixari.dev/docs/`: static pages grouped by audience (Using OpenTodo, Self-hosting, Integrations, Internals), search that runs in the browser with a prebuilt index, readable without JavaScript, WCAG 2.2 AA, light and dark, phone first, "Edit this page on GitHub", the version it describes.
- **Help inside the app:** a Help view that ships with the app and works offline, matching the server's version exactly, with the same search. Screens, settings panels and dialogs get a "Help" link to the relevant section, opened without losing what the user was doing. The `?` overlay and `:help` link to it.
- **Screenshots** in the guides are generated from the seeded demo data by a script, in light and dark, so they can be refreshed with one command.

## Out of scope

- Translations: guides are English only for now; the structure allows adding languages later.
- Versioned docs per release on the website: the website shows the latest release; each installed app carries the docs of its own version.
- A hosted docs platform, third-party search, comments or feedback widgets on pages.
- Rewriting the existing reference pages beyond front matter, headings and broken links.

## ROADMAP

Not on the roadmap yet; adds a "Documentation" row (`user-documentation`) under the launch work, next to `demo-sandboxes` and `mobile-layout`. It also gives the "Real-world verification" item a place to record results.

## Impact

- **Spec:** new capability `documentation`.
- **Code:** `web/scripts/docs/` (build, check, search index), generated `website/docs/` and a lazily loaded help bundle in `web/`, a Help view and help links in `web/src/app/`, the shortcut table moved to a data module shared by the overlay and the guide, a screenshot script, CI steps.
- **No server, API or data change.** No new route, no new environment variable, nothing **BREAKING**. One build-time dependency (a Markdown parser) in `web/devDependencies`; nothing is added to the runtime bundle except the lazily loaded help content.

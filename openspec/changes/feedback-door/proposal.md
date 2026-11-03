## Why

Reporting something broken is a link to GitHub, buried in Settings → About. A person without a GitHub account stops there, and a short "hi" has nowhere natural to go. The message should start next to their name, and it should leave the app only when they choose, through a door they already understand: a GitHub issue or their own mail program. The server sends nothing.

## What Changes

- The account menu, under Help, gains "Something isn't working". The same item is in the phone drawer's account menu, because it is the same menu. It opens a dialog with a text box and two actions: Open on GitHub, and Send by email.
- The text box starts with what they type, then a short context block (version, page, browser, language, offline or not) that they can edit or delete. The dialog says a hello is welcome.
- Open on GitHub opens the new-issue page in a new tab with the text filled in. Send by email opens the person's mail program addressed to the project's published feedback address, with the same text. The app makes no request of its own.
- Settings → About's "Feedback and problems" row opens this dialog instead of jumping straight to the issue list.

Out of scope: a form that posts to a project server, sending mail through the owner's SMTP, attaching task content, a screenshot upload, a new sidebar icon, and a keyboard shortcut. Advances no ROADMAP.md item. No new environment variable, no op log change, no new API route.

## Capabilities

### New Capabilities

- `feedback`: the dialog, the two doors, and what is and is not sent.

### Modified Capabilities

- `app-shell`: the account menu offers "Something isn't working" under Help.
- `settings-navigation`: the About feedback row opens the dialog.

## Impact

- `web/src/app/SidebarFooter.tsx`, a small dialog component, Settings → About, `docs/feedback-and-support.md`.
- The feedback address is a constant next to the existing issue-tracker URL. The maintainer sets the mailbox before the change ships; the spec names the behaviour, not a guessed address.
- No server code, no dependency, no first-load growth beyond one menu item (the dialog loads when opened).

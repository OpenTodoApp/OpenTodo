## 1. The address

- [ ] 1.1 Set `FEEDBACK_EMAIL` beside `ISSUES_URL` to the mailbox the maintainer names. Do not invent one. Verify the constant is the address named in `docs/feedback-and-support.md`.

## 2. The dialog

- [x] 2.1 Add `FeedbackDialog`, lazy-loaded, with the hello line, the textarea starting at the top and a context block after a blank line (version or "unknown", page path, truncated user agent, language, offline), and Cancel. Open on GitHub and Send by email build the new-issue URL and the mailto URL, title from the first line or "Hello", and call `window.open`. Over 1800 characters, copy and open without the body. No account email, id, or task title is inserted. Verify `cd web && npm test -- feedbackDialog` (hello stays first, deleted context is omitted, unknown version offline, both doors, long text copies, `fetch` is not called).

## 3. Where it opens

- [x] 3.1 Add "Something isn't working" under Help in the account menu, with no shortcut, including while a time entry runs and in the phone drawer (the drawer closes first). The About feedback row opens the same dialog and its description stays within 90 characters. Search finds it under "feedback", "issue" and "bug". Verify `cd web && npm test -- sidebarFooter` and `cd web && npm test -- aboutSection`.

## 4. Docs and languages

- [x] 4.1 Translate the new chrome in the catalogues. Verify `make i18n-check`.
- [x] 4.2 Describe the dialog and the address in `docs/feedback-and-support.md`. Verify `make docs-check`.

## 5. Check

- [ ] 5.1 `cd web && npm test && npm run build`. If the first load exceeds `web/bundle-budget.json`, raise it in the same change and record the reason. Then `make check`.

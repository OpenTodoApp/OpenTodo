## Context

The account menu (`web/src/app/SidebarFooter.tsx`) is Settings, Help, Keyboard shortcuts, Sign out. The same menu is the phone drawer's account row. Settings → About has a Feedback and problems row whose button is a link to `ISSUES_URL` (`https://github.com/OpenTodoApp/OpenTodo/issues`, `web/src/app/WelcomeDialog.tsx`). The welcome note has its own link and stays as it is. There is no public mailbox constant today.

The privacy rule is unchanged: the app does not gain an outbound destination. Both doors are navigations the person starts, the same class as the About links.

## Goals / Non-Goals

**Goals:**

- One dialog, two doors, next to the person's name and on About.
- The person sees and can delete everything that will be sent.
- The app itself sends nothing.

**Non-Goals:**

- A POST to a project endpoint. Mail through the owner's SMTP. A screenshot. A new footer icon. A shortcut. Changing the welcome note.

## Decisions

### D1. One dialog, lazy

`FeedbackDialog` uses the existing `Dialog`. The menu item and the About row are static (a few strings). The dialog module is `lazy()`-loaded on first open, so the first load does not take the form. Expectation is under 1 KB on the first load; if the build measures over the budget, raise it in this change and say why.

The menu order is Settings, Help, Something isn't working, Keyboard shortcuts, separator, Sign out. No shortcut is registered, so the shortcut registry is untouched. The footer stays one row: this is a menu item, not an icon.

The drawer's account menu is the same component, so the item appears there. Choosing it closes the drawer, then opens the dialog, the same way Settings closes the drawer before navigating.

### D2. The text

The box is one textarea. It opens with a trailing context block, separated by a blank line, so a "hi" typed at the top stays first:

```
<caret here>

--
OpenTodo 0.22.0
Page: /today
Browser: Firefox 132
Language: en
Offline: no
```

Version comes from the same `auth/status` read About uses; "unknown" when it has never arrived. Page is the router path, not a task title. Browser is the user agent truncated to about 120 characters. Language is `currentLanguage()`. Offline is the existing online flag. No name, email, or id is inserted.

The lead line is translated: a hello is welcome. The title is "Something isn't working".

### D3. The doors

`FEEDBACK_EMAIL` sits next to `ISSUES_URL`. Open on GitHub builds `https://github.com/OpenTodoApp/OpenTodo/issues/new?title=&body=` via `URLSearchParams` and `window.open`. Send by email builds `mailto:<address>?subject=&body=`. The title and subject are the first non-empty line, trimmed to 80 characters, or "Hello" when the box is empty. Both use `noopener`.

The app does not `fetch` either. A test stubs `window.open` and asserts `fetch` was not called.

At 1800 characters of URL, the body is omitted, the text is copied with `navigator.clipboard.writeText`, and a notice in the dialog says it was copied. On clipboard failure the textarea is selected and the notice says to copy it. 1800 is under typical browser and mail-handler limits.

### D4. The address is not guessed

The constant ships only with a mailbox that actually receives mail. The implementation task stops for the maintainer to name it. The spec says "the project's published feedback address" so the behaviour does not depend on a string that might be wrong. `docs/feedback-and-support.md` gains a sentence for the dialog and the address.

### D5. About

The Feedback row's control becomes a button that opens the dialog. Its description becomes one sentence within 90 characters, for example "Write it here. It opens as a GitHub issue or an email." Search keywords "feedback", "issue" and "bug" are added in `settingsIndex.ts`. The row stays visible offline.

Data model impact: none. No op, no route, no dependency, no image or memory change. No environment variable.

Interface budget: no chrome row on a list, no sidebar destination, no task property, no shortcut, no new scroll region. The dialog is a modal over the current page. The footer remains one row, including while a time entry is running.

## Risks / Trade-offs

- [Someone pastes a task title into the box] → That is their choice. The app does not insert one. The context block is how they see what else goes.
- [The mailbox is published in the client, which is public source] → It is the same exposure as the GitHub URL. It is a dedicated address, not a personal one mixed with other mail, if the maintainer wants it that way.
- [A long URL is silently truncated by the browser] → The 1800-character fallback copies instead.
- [`whats-new` also edits the About requirement] → This delta is against today's About text plus the feedback sentence. Whichever change is applied second keeps the other's About sentences (the What's new card, the Follow on X rename).
- [The copy inventory still says the old feedback sentence] → Update that one cell when this change is archived. The live contract is this requirement plus the settings-copy lint.

## Migration Plan

None. Rollback is restoring the GitHub link on the About row and removing the menu item.

## Open Questions

- The mailbox string. Implementation does not invent one. The maintainer names `FEEDBACK_EMAIL` before the About row and the mailto action ship.

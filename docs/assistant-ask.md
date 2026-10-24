---
title: Ask, review and undo
summary: Open the assistant, ask a question, review the changes it proposes, apply the ones you want and undo them in one step.
audience: user
section: Guides
specs: []
screens: [ask#open-the-assistant]
order: 77
---
# Ask, review and undo

<picture><source srcset="images/assistant-review-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/assistant-review-light.webp" alt="The answer I've proposed moving 3 tasks to Friday, followed by a Proposed changes box listing Water the plants, Renew passport and Get three quotes for the kitchen, each with its old and new due date and a checkbox, and the buttons Apply 3 changes and Discard."></picture>

The [assistant](assistant.md) answers from your tasks and proposes changes. This page is the loop you go through: open, ask, review, apply, undo.

## Open the assistant

Press <kbd>Shift</kbd>+<kbd>I</kbd> or select **Ask** on **Today** to open the assistant beside the page you are on. The tray under the message box shows what it carries along, such as **Context: Today** or **Context: 1 selected task**. On a wide screen it opens as a panel on the right; on a phone it fills the screen, with the message box above the keyboard. <kbd>Esc</kbd> closes it and puts the focus back where it was.

The **Assistant** page (sidebar, or <kbd>g</kbd> then <kbd>k</kbd>) is the same conversation with the whole screen: a greeting, the message box and three skills to start from (**Plan my week**, **Triage my inbox**, **Turn an idea into a project**). The × beside them hides them on that device. **History** lists earlier conversations and **New chat** starts one.

The button, the shortcut and the page only work when the assistant is available to you. While it is off, the page says so, and the server owner finds the setup under **Settings → Integrations**.

## Ask and review

Type a question and press <kbd>Enter</kbd> (<kbd>Shift</kbd>+<kbd>Enter</kbd> adds a line). The answer appears as it is written; lines such as "Looking at Today…" show what the assistant is reading. Screen readers hear the answer a sentence at a time.

When you ask for changes, the answer ends with **Proposed changes**: one line per task or project, each change in words ("Due Sun 11 Oct → Fri 16 Oct", "Completed", "New task in Garden: Buy seeds").

- Every item is checked. Uncheck what you do not want; the head counts what is selected ("3 of 4 selected").
- **Apply 3 changes** (or <kbd>Enter</kbd> inside the list) applies the checked items. The summary says how many were applied ("4 of 5 changes applied").
- **Discard** (or <kbd>Esc</kbd> inside the list) drops the proposal. Nothing changes.
- Items in a **shared** project are marked, because other people see the change.
- An item that changed on another device after it was proposed is unchecked and marked **changed since proposed**. Applying the rest leaves the newer value alone.
- An item that no longer exists on this device is left out with a note.

One proposal holds at most 50 changes. For bigger requests the assistant proposes the first 50 and offers to continue after you have reviewed them.

Applied changes are ordinary edits made on this device: they show at once, work offline, sync to your other devices, appear in the task's history as **Assistant**, and trigger reminders, webhooks and notifications like any edit.

<picture><source srcset="images/assistant-phone-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/assistant-phone-light.webp" alt="On a phone the assistant fills the screen: the proposal with its checkboxes and buttons, and the message box at the bottom."></picture>

Small proposals can skip the review when you turn on [Apply small changes without review](assistant-settings.md#apply-small-changes-without-review).

## Undo

After applying, **Undo** appears in the panel and in a short notice at the bottom of the screen. It puts back every value the proposal changed and moves tasks it created to the Trash, in one step, also offline. If you edited one of those fields again in the meantime, your edit stays and the undo names that task. The last 20 applied proposals on a device can be undone.

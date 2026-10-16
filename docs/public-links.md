---
title: Public links
summary: Share a project's list with anyone who has the link, no account needed: view-only or with ticking, named, with an optional expiry, and revoked in one click.
audience: user
section: Guides
specs: [public-links]
screens: []
order: 74
---
# Public links

<picture><source srcset="images/share-dialog-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/share-dialog-light.webp" alt="The Share dialog for Home renovation: an email field, a role menu set to editor, and the member list with the owner and one editor."></picture>

A public link shows a project's list to anyone who has the link, with no account and no sign-in. Use it for a shopping list in a family group chat, or a packing list for friends. [Sharing and comments](sharing.md) covers sharing with people who have an account.

## Share with a public link

1. Open **Share** on the project. You need to be its owner or an admin.
2. Under **Share with a public link**, optionally give the link a name (like "Group chat"), and choose:
   - **View only**: people can see the list.
   - **Can tick items**: people can also tick tasks off, and untick a mis-tap.
3. Choose when it expires (never, or after 1 to 90 days), then select **Create public link**.
4. Select **Copy link** and paste it wherever you like. It is shown only once.

## What people see

The page shows the project's name, its open tasks by section with subtasks under them, due dates and priorities, and the tasks ticked in the last day. It never shows notes, labels, comments or who is on the project. A banner says the list is public, and on a tick link that anyone with it can tick items. The page refreshes every 30 seconds while it's open, and right after each tick.

Ticks reach everyone's devices on their next sync. In a task's [history](task-history.md#see-what-changed-on-a-task), its Activity tab, a project's activity and [Updates](comments-and-activity.md#see-what-others-changed) they show **Public link** as the person, not the member who created the link.

## Show it on a display

Add `?display=1` to the link to show the list full screen in large type with a clock, for a tablet or an e-ink panel that has no account on it. The [display options](display-mode.md#make-it-readable) work here too: `/public/<link>?display=1&eink=1` is high contrast with nothing moving. The banner stays, the list refreshes every 30 seconds, and nothing is stored on the device.

## See and revoke links

While a project has an active public link, its header shows a **Public** badge. Select it to see the links, with their rights, expiry and when each was last opened. **Revoke** stops a link at once.

A link also stops working while the project is archived or deleted, or if whoever created it loses the owner or admin role; it works again when that is undone. Creating and revoking links needs a connection.

## Things to know

- **Anyone with the link can open it.** Share it only where you would share the list itself, and revoke it when it has done its job. "Last opened" shows unexpected use.
- **Encrypted projects can't be published.** With [end-to-end encryption](e2ee.md) on, the server can't read the tasks, so there is nothing it could show.
- **Not on the demo.** The public demo server refuses public links.

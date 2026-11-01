---
title: What the assistant sends and keeps
summary: What is sent to the model provider and when you agree to it, where conversations live, how tokens are counted, and how encrypted accounts use the assistant on their own device.
audience: user
section: Guides
specs: []
screens: []
order: 80
---
# What the assistant sends and keeps

<picture><source srcset="images/assistant-phone-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/assistant-phone-light.webp" alt="On a phone the assistant fills the screen: the proposal with its checkboxes and buttons, and the message box at the bottom."></picture>

The [assistant](assistant.md) sends your task content to a model provider only after you have agreed, keeps conversations on your device, and counts every answer against a monthly allowance.

## Before your first message

The panel first shows what will be sent and to whom:

- the provider and model the owner chose, or the provider you chose with your own key,
- what may be sent: tasks (title, description, dates, repeats, priority, estimate, completion, custom fields, location, the link a task came from), comments, attachment names, types and links (never the files), notes, tracked time, your routines and calendar frames; workspace, project, section and label names and project descriptions; names of members and groups you share with; saved view names and webhook hosts when you [describe a routine](routines.md#describe-it); your display name, date and time zone, your messages and [photos you add](assistant-capture.md#what-is-kept),
- for a routine's **Ask AI** or **Summarise** step: its instruction and what it reads, on a schedule or after an event, while you may not be looking.

In a shared project that includes text other members wrote. Select **Accept and continue** to start. Nothing is sent to any provider before you accept. If the provider changes later (also to [your own](assistant-settings.md#use-your-own-provider-and-key)), the assistant asks you again. You can withdraw consent in **Settings → Integrations → Assistant**.

## Conversations stay on this device

Conversations are stored only in this browser: never synced, shared, exported or backed up. The panel keeps the last 50 for up to 30 days. **History** lists them (also offline), **New** starts another, and **Clear conversations** deletes them (also in **Settings → Integrations → Assistant**). Signing out deletes them too. The server keeps nothing of a conversation after it has answered.

Offline you can read earlier conversations and apply or undo a proposal that already arrived; asking needs a connection.

## Costs and limits

Each answer shows how many tokens it used and how much of your monthly allowance that is ("1,240 tokens · this month 18% of your limit"); **Settings → Integrations → Assistant** shows the month so far. The owner sets the allowance (500,000 tokens per person per month by default). It resets on the first day of each month (UTC). One answer at a time per person. A [Describe it](routines.md#describe-it) draft is one answer too.

Answers on your own key are paid by you and do not count toward the allowance unless the owner chooses to count them ("1,240 tokens · your key").

## End-to-end encrypted accounts

If your account uses [end-to-end encryption](e2ee.md), the server never runs the assistant for you: it holds no key to your tasks.

When the server owner allows it, the assistant runs [on your device](assistant-encrypted.md) instead. Your device sends what you type and the task data a question needs directly to the provider you set up there, with your own key. It sends less than the server's assistant ([what it sends](assistant-encrypted.md#what-the-device-sends)). The OpenTodo server receives only your consent (which provider you accepted, not the key, the model or the address) and nothing of the conversation. The key is kept in this browser only and deleted at sign-out. Usage is shown on the device and never reported.

When the owner does not allow it, the panel explains that the assistant cannot read encrypted tasks and links to **Settings → Account → End-to-end encryption**, where you can turn encryption off to use the server's assistant.

## Demo instance

The assistant is switched off on the public demo.

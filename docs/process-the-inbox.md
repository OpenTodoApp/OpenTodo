---
title: Process the Inbox
summary: The Inbox with the selected task beside it, then Process to decide each task with one key, today, schedule, move, delegate, label, Someday, complete or trash, with Undo and offline.
audience: user
section: Guides
specs: [inbox-triage, web-app, task-list-presentation]
screens: [inbox/triage]
order: 22
---
# Process the Inbox

<picture><source srcset="images/triage-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/triage-light.webp" alt="Process the Inbox: one task card, Renew passport, with buttons for Today, Schedule, Move, Delegate, Labels, Someday, Complete, Trash, Skip and Back, each with its key."></picture>

Capture first, decide later. When the Inbox has piled up, select **Process** in its header (or press <kbd>P</kbd> there, <kbd>g</kbd> <kbd>p</kbd> anywhere) and decide each task in turn, keyboard only if you like. One task is shown at a time with its notes, date and labels, and "4 of 17" tells you how far you are.

## The Inbox beside its tasks

On a screen at least 1024 px wide the Inbox keeps the selected task beside the list: move with <kbd>j</kbd> and <kbd>k</kbd> or click a row and its details follow, ready to edit. <kbd>Enter</kbd> opens the task as its page; <kbd>Esc</kbd> clears the selection. Each row says where its task came from and when, such as "From email · 3 d ago" or "From a calendar app · 2 h ago". **Process** is the header's main button, also <kbd>P</kbd>, and the header says how many tasks are left to sort.

## Decide each task

| Key | Decision |
| --- | --- |
| <kbd>t</kbd> | Due today |
| <kbd>s</kbd> | Schedule: pick a day (see below), or type a date (`fri`, `3/11`) and press <kbd>Enter</kbd> |
| <kbd>m</kbd> | Move to a project |
| <kbd>a</kbd> | Delegate: move it into a shared project and assign it to someone there, in one step |
| <kbd>l</kbd> | Labels. This one doesn't move on, so you can add a label and then decide |
| <kbd>y</kbd> | Park it in [Someday](built-in-views.md#park-ideas-in-someday) |
| <kbd>c</kbd> | Complete |
| <kbd>Delete</kbd> | Move to the Trash |
| <kbd>j</kbd> or <kbd>Space</kbd> | Skip it for now |
| <kbd>k</kbd> | Back to the previous task |
| <kbd>Enter</kbd> | Open the task's panel to edit anything else; <kbd>Esc</kbd> comes back |

Every decision moves on to the next task and shows **Undo** for a few seconds. The buttons under the card do the same by mouse or touch. Delegating needs a project you share with someone; until you have one, the button says so. A task you date, move or park has a place, so it leaves the Inbox ([where planned tasks go](today-and-upcoming.md#where-planned-tasks-go)).

## Schedule

<kbd>s</kbd> opens a sheet with the same choices as the panel's **Do on**: **Today**, **Tomorrow**, **This weekend** and **Next week**, each with its date, a field that shows what it understood before you press <kbd>Enter</kbd>, and a calendar. When the task has a deadline, choices counted back from it come first, on number keys: <kbd>1</kbd> **On the deadline**, <kbd>2</kbd> **1 day before**, <kbd>3</kbd> **3 days before**, <kbd>4</kbd> **1 week before**, <kbd>5</kbd> **2 weeks before**, <kbd>6</kbd> **1 month before**. A choice that would fall before today isn't offered, and the deadline is marked in the calendar. <kbd>Esc</kbd> closes the sheet without a change.

## The queue

The queue is the Inbox in its order when you start. Tasks you decide stay counted, so "4 of 17" doesn't jump; tasks captured meanwhile, on any device, join the end; a task someone moves out of the Inbox elsewhere drops out, and the mode tells you. When nothing is left you see **Inbox zero** and the way back.

<kbd>Esc</kbd> returns to the Inbox with the task you were on selected. It all works offline, like any edit, and with Vim keybindings on, <kbd>x</kbd>, <kbd>dd</kbd>, `:triage` and `:q` work too.

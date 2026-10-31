---
title: Focus
summary: Work on one task at a time with a Pomodoro, Flowtime or Countdown timer, take breaks when you need them, and log the time worked on the task.
audience: user
section: Guides
specs: [web-app, settings-navigation, focus-mode, action-menus, app-shell]
screens: [focus, settings/focus]
order: 22
---
# Focus

<picture><source srcset="images/focus-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/focus-light.webp" alt="The Focus screen: one task of the sample data with a large timer at 24:58, Work session 1 of 4, Logged as time on this task, and buttons for Back, Pause, Complete, Take a break and Next task."></picture>

Focus shows one task and a large timer, and nothing else to pick from.

## Open it

- **Focus** in the sidebar's **More** group, after Statistics. To keep it next to Inbox and Today, see [Sidebar counts and order](sidebar-counts-and-order.md).
- The clock button at the top of the [task panel](task-panel.md), or **Focus on this task** in its **⋯** menu.
- **Start focus** in a task's menu: <kbd>.</kbd>, the row's **⋯** button or a right-click. On a phone, hold the task, then tap **Actions**.
- <kbd>g</kbd> <kbd>Shift+F</kbd>, or `focus` in [Search and commands](search.md).

From a task, Focus starts a session at once (Countdown asks for the length first). If the session already runs on that task, Focus just opens. If it runs on another task, that one stops and a notice names it, with **Undo** to go back. Completed tasks and tasks you can only view don't offer this.

## Which task

Without a task of your own choosing, Focus takes the first open task of **today's focus**, picked in the [Daily check](method/rhythms.md#daily-check) (with [Bento](method/rhythms.md#bento), in its Frog or Summit order). Its **⋯** menu has [**Add to focus**](method/rhythms.md#pick-the-focus-by-touch) and **Remove from focus**. Completing it, or <kbd>n</kbd>, moves on to the next one. When none is left, **Choose a task** finds any open task by name, as **Change task** in the screen's menu does at any time.

The task's notes and subtasks are shown below the timer. Tick subtasks there; **Edit the notes** opens the task panel.

## The three timers

Choose the timer in the screen's menu or in Settings. It can't change while a session runs.

- **Pomodoro**: 25 minutes of work, then a 5 minute break, and a 15 minute break after every fourth session. All four numbers are yours to change.
- **Flowtime**: counts up from 0:00 until you select **Done**, then offers a break.
- **Countdown**: asks for a length first, from 5 to 180 minutes, and remembers the last one on this device. Your [presets](focus-options.md#countdown-presets) start a length in one tap.

When a session or a break ends, Focus says what ended and how long you worked, and offers the next step: start the break, complete the task, the next task, or [a few more minutes](focus-options.md#a-few-more-minutes). A tone, a [break reminder](focus-options.md#breaks-sound-and-notifications) and a notification are optional.

## Keys

| Key | What it does |
| --- | --- |
| <kbd>Space</kbd> | Start, pause or resume |
| <kbd>Enter</kbd> | Complete the task and end the session |
| <kbd>b</kbd> | Take a break now, or end the break |
| <kbd>n</kbd> | Next task of today's focus |
| <kbd>Esc</kbd> | Back to where you were; the session keeps running |

The keys don't fire while you type. Press <kbd>g</kbd> <kbd>Shift+F</kbd> to come back to a running session.

## Time worked

Each stretch of work is a [time entry](time-tracking.md) on the task: starting or resuming starts one; pausing, completing or a break ends it. Breaks are never logged. The entries sync like any other change and carry the timer, session and planned end, to [show elsewhere](focus-elsewhere.md). When the app can't log time, the timer works the same and nothing is written.

The running timer stays on this device, cleared at sign-out. The timer counts from the clock, so a reload, a laptop that slept or a tab in the background still shows the right time.

## Settings

**Settings → General → Focus timer** holds the timer, the lengths, the auto-starts, and the [break reminder, sound, presets and noise](focus-options.md), for all your devices.

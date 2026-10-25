---
title: Home Assistant
summary: The Home Assistant integration: install it from HACS, the token to use, the lists, counts, calendar and events, Assist, automations and limits.
audience: developer
section: Integrations
specs: []
screens: []
order: 32
---
# Home Assistant

The [OpenTodo integration for Home Assistant](https://github.com/pixari/opentodo-homeassistant) shows your OpenTodo lists as Home Assistant to-do lists, counts what is due, puts dated tasks on a calendar and fires an event when a task changes. Automations can then react to your tasks, and you can add and tick off tasks from a dashboard, a script or by voice.

It talks only to your own OpenTodo server, through the [HTTP API](api.md) with one token, and needs no change on the server. It runs in Home Assistant 2026.3 or later against OpenTodo 0.12 or later.

## Install

The integration is installed through [HACS](https://hacs.xyz) as a custom repository:

1. In HACS, open the menu (⋮), choose **Custom repositories**, enter `https://github.com/pixari/opentodo-homeassistant` and pick the type **Integration**.
2. Search HACS for **OpenTodo**, open it and choose **Download**.
3. Restart Home Assistant.

Without HACS, copy the `custom_components/opentodo` folder of the repository into the `custom_components` folder of your Home Assistant configuration and restart.

## Connect it

1. In OpenTodo, open **Settings → Integrations → API tokens**, choose **New token**, name it "Home Assistant" and pick the access **Full access**. Copy the token: it is shown once.
2. In Home Assistant, open **Settings → Devices & services**, choose **Add integration** and pick **OpenTodo**.
3. Enter the address you open OpenTodo at, such as `http://192.168.1.20:8080` or `https://todo.example.com`, and paste the token.

Home Assistant checks the address and the token before it saves anything, and says what is wrong: the server cannot be reached, the address is not an OpenTodo server, or the token was refused.

### Which token

| Access | Result |
| --- | --- |
| **Full access** | Everything below. Use this one. |
| **Read only** | Counts, the calendar, events (found by polling) and lists you can look at but not change. |
| **AI assistant** | Refused. An [agent token](api.md#agent-tokens) can make only a few kinds of changes, cannot reorder tasks or create the webhook, and records its changes as an assistant's. |
| **Admin** | Refused. Home Assistant does not need access to passwords, tokens or user administration. |

Changes made from Home Assistant show in a task's history like changes from the API. When the token is revoked, Home Assistant asks for a new one; the token can be replaced, and the address changed, without removing the integration (**Reconfigure** in its menu).

### Encrypted accounts

An account with [end-to-end encryption](e2ee.md) cannot be connected: the server holds only ciphertext titles, so Home Assistant could show nothing readable. The setup refuses it with that explanation. When encryption is turned on later, the integration stops updating and shows a repair issue.

## What it adds

All entities belong to one account, so a household with several OpenTodo accounts adds the integration once per account.

### To-do lists

- **Inbox**: what the app's Inbox shows, tasks with no project and no date yet.
- **Today**: what the app's Today shows: due today or earlier, a deadline reached, or a start date that has come. Items added here are due today.
- **One list per project**, for every project or the ones you pick in the options. Archived projects have none.

Each list holds the open tasks in the app's order, sections and subtasks included (a subtask follows its parent), followed by the tasks completed in the last day. From Home Assistant you can add, rename, complete, reopen, give a date or a time, edit the notes, reorder and remove tasks. A task with a repeat rule moves on to its next date when completed, as in the app. Removing a task, or **Clear completed**, moves it to OpenTodo's [Trash](trash-and-history.md), where it can be restored.

The text of a new item is read with the [quick-add](quick-add.md) syntax in your account's language: `milk tomorrow #Home p1 @errands` becomes the task "milk" in Home, due tomorrow, priority 1, with the label errands (created when it does not exist yet). A `#project` in the text wins over the list the item was added to; a date picked in Home Assistant wins over a date in the text. The options can turn this off.

### Counts

| Sensor | Counts |
| --- | --- |
| Today | the tasks in Today |
| Earlier | Today's late tasks: due before today, or a deadline passed and not planned for today (tasks waiting for another task are left out) |
| Inbox | the tasks in the Inbox |
| One per project | the project's open tasks, without Someday and deferred ones, like the sidebar |

Each sensor lists its first 20 tasks in the `tasks` attribute (id, title, due, priority, project), for a card or a notification.

### Calendar

One calendar, **Tasks**, holds every task with a do-on date: all day for a date, or a block of the task's estimate from its time (30 minutes without an estimate). It is read-only. Calendar triggers make "when a task's time comes" automations easy.

### Events

| Event | Fires when |
| --- | --- |
| `opentodo_task_created` | a task is added |
| `opentodo_task_updated` | a task changes in another way |
| `opentodo_task_completed` | a task is completed (for a repeating task: each occurrence) |
| `opentodo_task_reopened` | a completed task is opened again |
| `opentodo_task_deleted` | a task goes to the Trash |
| `opentodo_task_assigned` | a task gets an assignee (fires next to created or updated) |
| `opentodo_task_due` | a timed task's time comes, or the day of a task with a date only begins |

The event data has `task_id`, `title`, `description`, `project_id`, `project_name`, `due`, `deadline`, `priority`, `labels` (names), `assignee_id`, `completed_at`, `completed_by`, `series_id`, `url` (opens the task in OpenTodo), `source` (from the webhook: `device`, `server`, `caldav`, `rule`, …), `delivery` (`push`, `poll` or `clock`) and, for changes, `changes` in the [webhook](webhooks.md#payload-version-1) format. Changes made from Home Assistant fire events too.

### The add_task action

`opentodo.add_task` adds a task and answers with it, so a script can use the new task's id or link. It takes `text` (with quick-add syntax), and optionally `project` (a name or id), `due_date` or `due_datetime`, `priority` (1 to 4), `labels`, `description` and `quick_add` (off keeps the text as the title).

```yaml
action: opentodo.add_task
data:
  text: "Replace the filter #Home @maintenance"
  due_date: "2026-11-02"
response_variable: added
```

### Assist

Home Assistant's own list sentences work with every list: "add bread to the Home list" and "check off bread from the Home list". A conversation agent that uses an AI model can also read the lists. Lists are named after the project, so give them aliases in Home Assistant when a project's name is hard to say.

## Instant updates

When it starts, the integration creates one [webhook](webhooks.md) in your account that calls Home Assistant on every task and project change, so the lists and events follow within a second. Every delivery is signed and Home Assistant checks the signature and its time before it accepts it. The integration checks the webhook every hour: it re-enables it when OpenTodo disabled it after failures and follows a change of Home Assistant's address. Removing the integration deletes the webhook. Without the webhook it asks OpenTodo for changes every two minutes (an option); with it, every 15 minutes as a safety net.

OpenTodo refuses webhooks to private network addresses until its owner allows them (see [Private network protection](webhooks.md#private-network-protection)). When Home Assistant runs on your LAN, the owner turns on **Settings → Integrations → Webhooks → Allow private network targets**; until then Home Assistant shows a repair issue that says so, and polls. When OpenTodo cannot reach Home Assistant at the address Home Assistant uses for itself, for example in separate Docker networks, set **Home Assistant address for OpenTodo** in the integration's options.

## Options

| Option | Default |
| --- | --- |
| Show every project, or the projects you pick | every project |
| Show a Today list | on |
| Keep completed tasks visible for (days, 0 hides them) | 1 |
| Read quick-add syntax in new items | on |
| Check for changes every (minutes) | 2 |
| Instant updates | on |
| Home Assistant address for OpenTodo | empty |

## Automation examples

Turn on a light when the plants are watered:

```yaml
alias: Plants watered
triggers:
  - trigger: event
    event_type: opentodo_task_completed
    event_data:
      title: Water plants
actions:
  - action: light.turn_on
    target:
      entity_id: light.balcony
```

A morning notification with today's count and what is late (the sensor ids start with the account's name):

```yaml
alias: Morning tasks
triggers:
  - trigger: time
    at: "07:30:00"
actions:
  - action: notify.mobile_app_phone
    data:
      message: >
        {{ states('sensor.olivia_todo_example_com_today') }} tasks today,
        {{ states('sensor.olivia_todo_example_com_earlier') }} from earlier.
```

Add a task when the washing machine finishes:

```yaml
alias: Laundry reminder
triggers:
  - trigger: state
    entity_id: sensor.washer_status
    to: finished
actions:
  - action: opentodo.add_task
    data:
      text: "Hang the laundry today p2 #Home"
```

## Limits

- Lists are flat: subtasks follow their parent and keep their parent when moved.
- Dates without a time zone are read in Home Assistant's time zone. The app's "Day starts at" preference is not applied to Today and Earlier.
- The calendar shows a repeating task's next occurrence only, and nothing about deadlines.
- In a shared project where you are a viewer, changes are refused with OpenTodo's message.
- Projects kept away from AI assistants are not hidden: the integration uses an ordinary Full access token.

To run OpenTodo itself inside Home Assistant OS, see [Running as a Home Assistant add-on](self-hosting/home-assistant-addon.md), which is a separate project. Problems with the integration go to its [issue tracker](https://github.com/pixari/opentodo-homeassistant/issues).

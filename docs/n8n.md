---
title: n8n
summary: The n8n community nodes: install them, the token to use, the task, project, label and comment operations, the signed trigger, example workflows, AI agents and limits.
audience: developer
section: Integrations
specs: []
screens: []
order: 34
---
# n8n

The [OpenTodo nodes for n8n](https://github.com/OpenTodoApp/n8n-nodes-opentodo) connect your tasks to the hundreds of services [n8n](https://n8n.io) works with. The **OpenTodo** node creates, reads, changes and completes tasks and manages projects, labels and comments. The **OpenTodo Trigger** starts a workflow when a task or project changes. Turn a new GitHub issue into a task, post to a chat when a task is completed, or send yourself a digest of what is due.

The nodes talk only to your own OpenTodo server, through the [HTTP API](api.md) with one token, and need no change on the server. They are tested with n8n 2.44 and OpenTodo 0.13.

## Install

The package is installed from npm as `n8n-nodes-opentodo` once it is released. On a self-hosted n8n, as its owner:

1. Open **Settings → Community nodes** and choose **Install**.
2. Enter `n8n-nodes-opentodo`, confirm the notice about community code and choose **Install**.

The **OpenTodo** and **OpenTodo Trigger** nodes then appear in the node panel. In queue mode, or in an image you build yourself, run `npm install n8n-nodes-opentodo` in `~/.n8n/nodes` instead.

## Connect it

1. In OpenTodo, open **Settings → Integrations → API tokens**, choose **New token**, name it "n8n" and pick the access (see below). Copy the token: it is shown once.
2. In n8n, create an **OpenTodo API** credential. Enter the address you open OpenTodo at, such as `https://todo.example.com` or `http://192.168.1.20:8080`, and paste the token.

n8n checks the pair when you save it. The address must be reachable from the n8n server.

### Which token

| Access | Result |
| --- | --- |
| **Full access** | Every operation and the trigger. Use this one for workflows that change things. |
| **Read only** | Get and Get Many of everything. Changes are refused with `insufficient_scope`, and the trigger cannot create its webhook. Enough for reports and digests. |
| **AI assistant** | Creating and editing tasks, projects, labels and comments, only while the owner and you [allow assistant changes](mcp.md#letting-an-assistant-make-changes); changes show as an assistant's in the task's history. No trigger. |
| **Admin** | Not needed. n8n never needs access to passwords, tokens or user administration. |

Changes made from n8n show in a task's history like changes from the API. Revoking the token stops every workflow that uses it.

## Operations

| Resource | Operations |
| --- | --- |
| Task | Create, Get, Get Many, Update, Complete, Reopen, Delete |
| Project | Create, Get, Get Many, Update, Archive |
| Label | Create, Get Many |
| Comment | Add, Get Many |

Fields follow the [task fields](api.md#task-fields) of the API: priority 1 is the highest and 4 the default, and dates are floating, so `2026-11-02` is that day wherever you are. Projects, labels and sections are picked from lists loaded from your server; **Inbox** stands for no project.

- **Create** takes a title and optionally the description (Markdown), project, section, labels, priority, due date, time and time zone, deadline, estimate, repeat rule, parent task, assignee and an [idempotency key](api.md#idempotency-keys), so a retried run does not add the task twice.
- **Parse Quick-Add Syntax** reads the title like [quick add](quick-add.md), in your account's language: `milk tomorrow 18:00 #Home p1 @errands remind me 30 min before` becomes "milk", due tomorrow at 18:00 in Home, priority 1, with the label errands (created when it does not exist) and a reminder. Fields set on the node win over the text.
- **Get Many** returns open tasks unless you pick another status, filtered by project, label, parent task, a due range, a completion range or text in the title and description, with **Return All** or a limit.
- **Complete** works like ticking the task in the app: a repeating task records the occurrence and moves to its next date. **Delete** moves the task to the [Trash](trash-and-history.md).
- **Archive** archives a project; **Update** with *Archived* off brings it back.

## The trigger

The **OpenTodo Trigger** starts the workflow on the [webhook events](webhooks.md#events) you pick: a task created, updated, completed, reopened or deleted, a project created, updated, archived or deleted, or an import finished or undone. It can be limited to one project. The workflow receives the [payload](webhooks.md#payload-version-1) as it is: `event`, the task or project with every field, `changes` with each changed field's old and new value, and `source`, so a workflow can ignore changes it made itself (`server`). There are no comment events.

When the workflow is activated, the node creates a webhook in your account that points at n8n, and keeps the secret OpenTodo returns. When it is deactivated, it deletes the webhook. It replaces the webhook when you change the events or the project, or when OpenTodo disabled it after repeated failures. You can see it in **Settings → Integrations → Webhooks** like any other.

Every delivery is [signed](webhooks.md#headers-and-signature). The node checks the signature and refuses a delivery whose signature is wrong or whose time is more than five minutes off, so nobody else can start your workflow by calling its address. OpenTodo delivers at least once; the node remembers recent delivery ids, so a redelivered event runs the workflow once. **Send test** in OpenTodo is answered without starting the workflow, unless **Emit Test Pings** is on.

### Reaching n8n

OpenTodo has to reach n8n's webhook address:

- Set n8n's `WEBHOOK_URL` (`N8N_WEBHOOK_URL` in recent versions) to an address the OpenTodo server can open.
- OpenTodo refuses webhooks to private network addresses until its **owner** turns on **Settings → Integrations → Webhooks → Allow private network targets** (see [Private network protection](webhooks.md#private-network-protection)). That is the case when n8n runs on your LAN, on Tailscale or next to OpenTodo in Docker. Until then, activating the workflow fails with `private_target`.

## Example workflows

**A new GitHub issue becomes a task.** GitHub Trigger on *issues* → If the action is `opened` → OpenTodo *Task → Create* with the issue's title, its link as the description, the project *Work* and the label *github*, and the issue's link as the idempotency key. For issues assigned to you, OpenTodo's own [issue import](issue-import.md) does this without n8n and keeps the task in step with the issue.

**A completed task is announced in Slack.** OpenTodo Trigger on *Task Completed*, limited to the project *Team* → Slack *Send message* with `Done: {{$json.data.task.title}}`.

**A morning digest.** Schedule Trigger at 07:30 → OpenTodo *Task → Get Many* with *Due To* set to today and **Return All** → Aggregate → Send Email with each task's title and date. A Read only token is enough.

**Mail to a task.** Email Trigger (IMAP) → OpenTodo *Task → Create* with the subject as the title and **Parse Quick-Add Syntax** on, so `Renew passport next friday p1 #Admin` lands in the right project. OpenTodo's own [email to task](email.md) covers the simple case without n8n.

## AI agents

The OpenTodo node can be attached to n8n's **AI Agent** as a tool, with the model filling the fields (`$fromAI()`). Add one tool for each operation you want to allow, such as *Task → Get Many* to answer questions and *Task → Create* to add tasks, and leave deletes out unless you want them. A Read only token keeps an agent to reading. With quick-add on, the model can write `Call Anna tomorrow 9am #Work p2` and let OpenTodo read it.

For an assistant you talk to directly, OpenTodo's [MCP endpoint](mcp.md) and the [assistant in the app](assistant.md) are the better fit; see [AI and agents](ai-and-agents.md).

## Limits

- Accounts with [end-to-end encryption](e2ee.md) show titles, notes and names to n8n as ciphertext (`enc:v1:…`), and quick-add cannot match project or label names.
- **Get Many** receives every task of the account and filters in n8n, except for the completion range, which the server applies. On a very large account, use a narrow filter and a limit.
- Search looks at the title and description of the tasks received; there is no server-side search.
- The time spent in quick-add (`30m/2h`) is not recorded; the estimate is.
- The API changes exactly the item you name: deleting a parent task or archiving a parent project does not change its subtasks or sub-projects, unlike the app.
- In a shared project where you are a viewer, changes are refused with OpenTodo's message.
- The trigger needs a self-hosted n8n, or an n8n the OpenTodo server can reach, and an account has at most 20 webhooks.

Problems with the nodes go to their [issue tracker](https://github.com/OpenTodoApp/n8n-nodes-opentodo/issues).

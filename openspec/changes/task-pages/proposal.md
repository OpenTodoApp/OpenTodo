## Why

Handing a task to someone without an account is clumsy today: you copy its title into a chat, the details get lost, and nothing comes back into OpenTodo. Public links share a whole project as a plain list, never one task with its description, its subtasks and a place to reply, and an account with end-to-end encryption cannot publish anything at all. A task page turns one task into a calm, readable page you can send to a friend, a colleague or a tradesperson, who can then reply, tick subtasks and mark it done, with every answer landing back on the task.

## What Changes

- **Publish a task page** from the task panel's menu: a one-page view of one task at `/t/<secret>`, with an optional readable label (`/t/<secret>/<label>`) that is decoration only, never the key. Rights chosen at publish time: read only, or reply, or reply and tick (subtasks and the task itself). Optional expiry. One active page per task; publishing again replaces it.
- **The page**: title, the description rendered as formatted text, the due date and deadline in plain words, subtasks as a checklist, link attachments (file attachments for unencrypted tasks), the map when the task has a location (change `task-locations`) and maps are on, and the conversation since the page was published. Readable on a 360 px phone, keyboard and screen reader friendly, with no third-party assets, no cookies, `noindex` and `no-referrer`.
- **Guests reply with a name they type**, no account. Their replies become comments on the task and their ticks become completions, written through the op log with a reserved device `page:<page-id>` and attributed to the page and the typed name. The publisher gets an in-app notification for every reply and completion.
- **Encrypted accounts can publish.** For a task the server can only see as ciphertext, the publisher's device makes a random share key for the page (never the account key), encrypts a snapshot of the task with it and uploads the ciphertext; the link carries the key after `#`, which browsers never send to the server. The guest's browser decrypts the page and encrypts replies with the same key; the publisher's devices import them as comments and re-publish the snapshot when the task changes. Unencrypted tasks are served live from the server's state.
- **Lifecycle**: the page stops working when it is revoked or expires, when the task is deleted, or when the publisher loses the right to publish it; a completed task shows as done. Abuse limits per page, per address and per account, and guessing a secret costs as much as guessing a password.

## Capabilities

### New Capabilities
- `task-pages`: publishing one task as a page, the page itself, guest replies and ticks, attribution and notifications, encrypted snapshots, lifecycle and limits.

### Modified Capabilities
- `public-links`: the reserved device id prefix covers `page:` as well as `public:`.
- `end-to-end-encryption`: encrypted accounts still cannot publish projects, but can publish task pages through a share key held only in the link.
- `comments`: a comment can carry the typed name of the guest who wrote it through a task page.
- `activity-log`: operations written through a task page form their own events, like public link operations.

## Impact

- Server: new tables for pages and pending encrypted replies (one migration), routes under `/api/v1/tasks/{id}/page` (signed in) and `/api/v1/pages/{secret}` (public), the page shell at `/t/`, a notify event kind for page replies, demo deny list entries for publishing.
- Web: the publish dialog and the "Published" marker in the task panel, a small separate page bundle for `/t/` (no app shell, no IndexedDB), the snapshot encryption and re-publishing on the publisher's devices, import of encrypted replies.
- Op schema: additive comment fields `guest_name` (content, encrypted for encrypted accounts) and `page_id`.
- No new dependency, no new environment variable, no change to the op log format.
- ROADMAP: not listed yet. It extends item 13, "Public and guest links" (`public-links`), from a project to one task; the change adds a ROADMAP row.

Out of scope: guest accounts or sign-in, guests editing the title, description, dates or assignee, pages for several tasks at once (public links already cover a project), file attachments on encrypted pages, email delivery of the link (it is copied and sent by the publisher), a custom domain per page, search-engine visibility.

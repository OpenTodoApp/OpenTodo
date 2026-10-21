# Spec Delta

## ADDED Requirements

### Requirement: Origin URL in write tools
`create_tasks` items and `update_tasks` SHALL accept an optional `origin_url`: an `http` or `https` URL from which the server derives the origin (`kind: "issue"` with provider and id for a recognised host, else `kind: "url"`) without any request to it; `update_tasks` SHALL also accept `null` to clear. Any other value SHALL be a tool error `invalid_input` for the whole call.

#### Scenario: Assistant files an issue as a task
- **WHEN** an allowed assistant calls `create_tasks` with one item `{"title": "Fix the login timeout", "origin_url": "https://gitlab.com/g/p/-/issues/12"}`
- **THEN** the task is created with origin `{kind: "issue", provider: "gitlab", id: "g/p#12", url: "https://gitlab.com/g/p/-/issues/12"}`, written through the operation log with the agent device id, and the result lists its id

#### Scenario: Unsafe origin URL
- **WHEN** an assistant calls `create_tasks` with `origin_url: "javascript:alert(1)"`
- **THEN** the result is a tool error `invalid_input` and no task is created

### Requirement: Task origin in tool results
Task results of the read tools, the write tools and the `opentodo://` task resources SHALL carry `origin` (`null` when unset), with its `title` and `url` inside the untrusted-text marking like the task title and its `kind`, `provider` and `id` outside it.

#### Scenario: Origin in a read
- **WHEN** an assistant calls `get_task` on a task captured from a page titled "Interesting article"
- **THEN** the result carries `origin` with its `title` and `url` marked as untrusted text and its `kind` outside the marking

#### Scenario: Encrypted account
- **WHEN** an assistant reads a task of an end-to-end encrypted account that has an origin
- **THEN** the result marks the task as encrypted and carries no origin members, never the ciphertext

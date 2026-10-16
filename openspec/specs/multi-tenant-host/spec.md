# multi-tenant-host Specification

## Purpose
Lets one server process host many independent OpenTodo tenants, each an ordinary data directory, so a hosted service can serve many households and teams at low cost while every tenant stays isolated and portable to a self-hosted server.

## Requirements

### Requirement: A tenant is a data directory
A tenant SHALL consist of exactly one data directory with the same layout as a self-hosted server's. A server without host mode SHALL serve exactly one tenant and SHALL behave as it did before this capability existed. Tenants in one process SHALL share no accounts, sessions, operations, notifications, live-update channels or push keys.

#### Scenario: Self-hosted server unchanged
- **WHEN** an existing self-hosted server is upgraded without enabling host mode
- **THEN** it serves its data directory exactly as before, with the same settings, routes and background jobs

#### Scenario: Moving a tenant to a self-hosted server
- **WHEN** a tenant's data directory, or its exported archive, is restored into a fresh self-hosted server
- **THEN** that server serves the tenant's accounts and data with no conversion, and devices converge after their next sync

#### Scenario: Two tenants in one process
- **WHEN** two tenants with separate data directories run in one process and a session of the first is presented to the second
- **THEN** the second answers 401, and neither serves the other's operations or notifications

### Requirement: Host mode routing
With host mode enabled, the server SHALL select the tenant for each request from the request's host name: the single label in front of the host's configured address. A host name that names no active tenant SHALL be answered with 404 and the standard error envelope and SHALL NOT reveal whether such a tenant ever existed; a suspended tenant SHALL answer 503. Requests SHALL never read or write another tenant's data. The host's own address SHALL answer the health check only.

#### Scenario: Two tenants
- **WHEN** `alice.example.cloud` and `smith.example.cloud` are both tenants and a request for `alice.example.cloud` syncs
- **THEN** only Alice's tenant receives the operations, and Smith's devices see nothing of them

#### Scenario: Unknown host name
- **WHEN** a request arrives for a host name that is not a tenant, or names a deleted one
- **THEN** the server answers 404 with the standard error envelope, the same for both

### Requirement: Idle tenants use no memory
In host mode, a tenant SHALL be opened on its first request, running any pending schema migrations at that moment, and SHALL be closed after a configurable idle time, unless a request, including a device's live event stream, is using it. The number of open tenants SHALL be bounded by a configurable limit, closing the least recently used idle tenant first; when every open tenant is in use the request SHALL be answered 503 with a retry hint.

#### Scenario: Cold start
- **WHEN** a tenant that has been idle for a day receives a sign-in request
- **THEN** the tenant is opened, migrated if needed and serves the request, and the response time stays under one second on reference hardware

#### Scenario: Live device keeps a tenant open
- **WHEN** a device has an open event stream to a tenant
- **THEN** the tenant is not closed for idleness while the stream stays open

#### Scenario: Cap reached
- **WHEN** the open-tenant limit is reached and a request arrives for a closed tenant
- **THEN** the least recently used tenant that nobody is using is closed and the new one is opened

#### Scenario: Migration fails for one tenant
- **WHEN** a pending migration fails while opening one tenant
- **THEN** that tenant answers 503 and the failure is reported to the operator, every other tenant keeps working, and the tenant opens again once the cause is fixed

### Requirement: Background work scales with due work
In host mode, reminders, scheduled backups, trash retention, audit and delivery-log pruning, webhook deliveries and calendar subscription fetches SHALL be run for a tenant only when that tenant has work due, recorded in a host-level index that each open tenant keeps current, without polling every tenant. Reminders SHALL be delivered no later than they would be on a self-hosted server.

#### Scenario: Reminder in a closed tenant
- **WHEN** a reminder is due in a tenant that is currently closed
- **THEN** the host opens that tenant, delivers the push notification within the usual delay, records the delivery through the op log, and may close the tenant again

#### Scenario: Thousands of idle tenants
- **WHEN** the host has 10,000 tenants and none has work due in the next hour
- **THEN** no tenant is opened during that hour

### Requirement: One process runs the background work
In host mode, the shared background work SHALL run in one host process at a time, like a self-hosted server's background jobs: during a rolling update the new process serves requests beside the old one and takes the work over when the old one stops. Work that is still due after it ran (a transient failure) SHALL be retried on a later pass, never in a tight loop.

#### Scenario: Rolling update
- **WHEN** a new host process starts beside the running one on the same data directory
- **THEN** both serve requests, only the running one runs the background work, and the new one takes it over when the old one exits

### Requirement: Per-tenant limits
In host mode, the operator SHALL be able to set limits per tenant on database size, operations per hour and in total, request rate, import size and number of members, with host-wide defaults. A write that would exceed a limit SHALL be refused with an error naming the limit, while reads and sync of existing data keep working. Moving items to the Trash SHALL stay possible at the storage limit.

#### Scenario: Database size limit
- **WHEN** a tenant reaches its database size limit and a device syncs a new task
- **THEN** that operation is refused with a reason naming the storage limit, the device keeps the task locally and marks it unsynced, and other devices are unaffected

#### Scenario: Request rate
- **WHEN** a tenant receives more requests in a minute than its limit
- **THEN** the extra requests are answered 429 with a code naming the request limit, and the next minute works again

#### Scenario: Member limit
- **WHEN** a tenant has as many active accounts as its member limit and someone registers
- **THEN** the account is not created and the answer names the member limit

### Requirement: Limit refusals keep the device's changes
Operations refused by a tenant limit SHALL be reported per operation, never blocking the rest of a device's outbox. The server SHALL NOT send its own value back for such an operation, so the device keeps the change, shows it as waiting, and sends it again later; devices converge once it is accepted.

#### Scenario: Room again
- **WHEN** a device holds a task refused for the storage limit and the owner empties the Trash
- **THEN** the device sends the task again on a later sync, it is accepted, and every device converges on it

### Requirement: Operator settings stay with the host
In host mode, outgoing email, single sign-on, backup destinations, the push contact, the MCP and assistant switches, sign-up, attachment limits and the webhook network policy SHALL come from the host's configuration. A tenant's owner SHALL NOT be able to read the operator's mail, sign-on or backup settings or change any of these: such requests SHALL be answered 403 with a code saying the operator manages them, and the web app SHALL hide those panels.

#### Scenario: Owner reaches an operator setting
- **WHEN** a hosted tenant's owner requests the outgoing email settings
- **THEN** the answer is 403 `host_managed` and nothing is revealed or changed

### Requirement: Tenant settings stay with the owner
Tenant-level settings (members, invitations, the two-factor policy, audit retention, CalDAV, calendar feeds, project invite links) SHALL stay with a hosted tenant's owner. A self-hosted server SHALL keep all of its settings with its owner, unchanged.

#### Scenario: Self-hosted owner
- **WHEN** the owner of a self-hosted server opens the outgoing email settings
- **THEN** they work exactly as before

### Requirement: Tenant lifecycle through an operator interface
In host mode, an operator interface SHALL create a tenant (empty, returning a single-use setup token for its first account, or from a backup archive), list and inspect tenants, change their limits, suspend and resume them, delete them, and export them as backup archives.

#### Scenario: Create from an archive
- **WHEN** the operator creates the tenant `smith` from a self-hosted server's backup archive
- **THEN** `smith.example.cloud` serves that data and its users can sign in with their existing credentials

#### Scenario: Unusable archive
- **WHEN** the operator creates a tenant from a file that is not a valid archive, or from an encrypted archive without its passphrase
- **THEN** the answer is 422 naming the problem and no tenant is created

#### Scenario: Suspended tenant
- **WHEN** the operator suspends a tenant
- **THEN** its host name answers 503 with a notice, its data is kept, and resuming it restores service without data loss

### Requirement: Operator interface access
The operator interface SHALL listen on its own address, SHALL require a host-level operator token, SHALL never be reachable through a tenant's host name, and SHALL answer unauthenticated or wrong-token requests with 401 without revealing tenant names.

#### Scenario: Unauthenticated operator request
- **WHEN** a request to the operator interface carries no token, or a wrong one
- **THEN** it is answered 401 and nothing is created, listed or changed

#### Scenario: Through a tenant's host name
- **WHEN** an operator path is requested at a tenant's host name
- **THEN** the tenant answers it like any unknown path, and the operator interface is not reached

### Requirement: Deleted tenants leave a tombstone
Deleting a tenant SHALL remove its data directory and keep its name reserved for a grace period, so a new tenant never receives the old one's devices and links.

#### Scenario: Deleted name
- **WHEN** a tenant is deleted and the operator creates a tenant with the same name within the grace period
- **THEN** the creation is refused, and after the grace period it succeeds

### Requirement: Owners can take their data away
In host mode, a tenant's owner SHALL be able to download the tenant as a backup archive from the web app at any time, in the same format `opentodo restore` reads. The download SHALL require the owner's recently confirmed session or a full API token; members and read or agent tokens SHALL be refused with 403. The download SHALL be recorded in the audit log and SHALL need a connection, like every server-side action.

#### Scenario: Leaving the hosted service
- **WHEN** an owner downloads the archive and restores it into a self-hosted server
- **THEN** every account, project, task, comment and setting of the tenant is present, and the owner's devices converge after pointing at the new server

#### Scenario: Read token
- **WHEN** the download is requested with a read API token
- **THEN** it is answered 403 `insufficient_scope` and nothing is sent

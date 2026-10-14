# Spec Delta

## Purpose

Lets one server process host many independent OpenTodo tenants, each an ordinary data directory, so a hosted service can serve many households and teams at low cost while every tenant stays isolated and portable to a self-hosted server.

## ADDED Requirements

### Requirement: A tenant is a data directory
A tenant SHALL consist of exactly one data directory with the same layout as a self-hosted server's. A server without host mode SHALL serve exactly one tenant and SHALL behave as it did before this capability existed.

#### Scenario: Self-hosted server unchanged
- **WHEN** an existing self-hosted server is upgraded without enabling host mode
- **THEN** it serves its data directory exactly as before, with the same settings, routes and background jobs

#### Scenario: Moving a tenant to a self-hosted server
- **WHEN** a tenant's data directory, or its exported archive, is restored into a fresh self-hosted server
- **THEN** that server serves the tenant's accounts and data with no conversion, and devices converge after their next sync

### Requirement: Host mode routing
With host mode enabled, the server SHALL select the tenant for each request from the request's host name. A host name that names no active tenant SHALL be answered with 404 and SHALL NOT reveal whether such a tenant ever existed. Requests SHALL never read or write another tenant's data.

#### Scenario: Two tenants
- **WHEN** `alice.example.cloud` and `smith.example.cloud` are both tenants and a request for `alice.example.cloud` syncs
- **THEN** only Alice's tenant receives the operations, and Smith's devices see nothing of them

#### Scenario: Unknown host name
- **WHEN** a request arrives for a host name that is not a tenant
- **THEN** the server answers 404 with the standard error envelope

### Requirement: Idle tenants use no memory
In host mode, a tenant SHALL be opened on its first request, running any pending schema migrations at that moment, and SHALL be closed after a configurable idle time, unless a device holds a live event stream to it. The number of open tenants SHALL be bounded by a configurable limit, closing the least recently used idle tenant first.

#### Scenario: Cold start
- **WHEN** a tenant that has been idle for a day receives a sign-in request
- **THEN** the tenant is opened, migrated if needed and serves the request, and the response time stays under one second on reference hardware

#### Scenario: Live device keeps a tenant open
- **WHEN** a device has an open event stream to a tenant
- **THEN** the tenant is not closed for idleness while the stream stays open

#### Scenario: Migration fails for one tenant
- **WHEN** a pending migration fails while opening one tenant
- **THEN** that tenant answers 503 and is reported to the operator, and every other tenant keeps working

### Requirement: Background work scales with due work
In host mode, reminders, scheduled backups, trash retention and webhook deliveries SHALL be run for a tenant only when that tenant has work due, without polling every tenant. Reminders SHALL be delivered no later than they would be on a self-hosted server.

#### Scenario: Reminder in a closed tenant
- **WHEN** a reminder is due in a tenant that is currently closed
- **THEN** the host opens that tenant, delivers the push notification within the usual delay, records the delivery through the op log, and may close the tenant again

#### Scenario: Thousands of idle tenants
- **WHEN** the host has 10,000 tenants and none has work due in the next hour
- **THEN** no tenant is opened during that hour

### Requirement: Per-tenant limits
In host mode, the operator SHALL be able to set limits per tenant on database size, operations per hour and in total, request rate, import size and number of members. A write that would exceed a limit SHALL be refused with an error naming the limit, while reads and sync of existing data keep working. Refused operations SHALL be reported per operation, never blocking the rest of a device's outbox.

#### Scenario: Database size limit
- **WHEN** a tenant reaches its database size limit and a device syncs a new task
- **THEN** that operation is refused with a reason naming the storage limit, the device keeps the task locally and marks it unsynced, and other devices are unaffected

### Requirement: Tenant lifecycle through an operator interface
In host mode, an operator interface SHALL create a tenant (empty or from a backup archive), suspend and resume it, delete it, and export it as a backup archive. The interface SHALL require a host-level operator token, SHALL never be reachable through a tenant's host name, and SHALL answer unauthenticated or wrong-token requests with 401 without revealing tenant names.

#### Scenario: Create from an archive
- **WHEN** the operator creates the tenant `smith` from a self-hosted server's backup archive
- **THEN** `smith.example.cloud` serves that data and its users can sign in with their existing credentials

#### Scenario: Unauthenticated operator request
- **WHEN** a request to the operator interface carries no token
- **THEN** it is answered 401 and nothing is created, listed or changed

#### Scenario: Suspended tenant
- **WHEN** the operator suspends a tenant
- **THEN** its host name answers 503 with a notice, its data is kept, and resuming it restores service without data loss

### Requirement: Owners can take their data away
In host mode, a tenant's owner SHALL be able to download the tenant as a backup archive from the web app at any time, in the same format `opentodo restore` reads.

#### Scenario: Leaving the hosted service
- **WHEN** an owner downloads the archive and restores it into a self-hosted server
- **THEN** every account, project, task, comment and setting of the tenant is present, and the owner's devices converge after pointing at the new server

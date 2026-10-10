# Spec Delta

## Purpose

Guarantees that the client works without a network, that every edit is captured as an operation, and that all of a user's devices converge on the same state after exchanging operations with the server.

## ADDED Requirements

### Requirement: Local store is the source of truth
The client SHALL keep a complete copy of the user's projects and tasks in browser storage and SHALL render every view from that copy. Edits SHALL be applied to the local copy before any network activity.

#### Scenario: Edit with no network
- **WHEN** the device is offline and the user creates, edits, completes or deletes tasks
- **THEN** every change is visible immediately and survives a page reload

#### Scenario: App loads offline
- **WHEN** the installed app is opened with no network after at least one successful sign-in
- **THEN** it opens to the user's tasks without an error page

### Requirement: Field-level operations
Every change SHALL be expressed as operations that each set one field of one entity and carry a unique id, a timestamp in milliseconds from a monotonic hybrid clock, and the id of the device that produced it. The server SHALL validate entity, field and value type against a published schema and SHALL reject a batch containing an invalid operation.

#### Scenario: Invalid operation in a batch
- **WHEN** a sync request contains an operation for an unknown field
- **THEN** the whole request is refused with a 400 `invalid_op` error and no operation from it is stored

### Requirement: Convergence by last-writer-wins per field
For each field, the value with the greatest timestamp SHALL win; equal timestamps SHALL be broken by comparing device ids. The same rule SHALL run on the server and on every client, so the resulting state depends only on the set of operations seen, not on their order of arrival.

#### Scenario: Concurrent edits of different fields
- **WHEN** device A changes a task's title offline while device B changes its priority offline, and both sync
- **THEN** both devices show the new title and the new priority

#### Scenario: Concurrent edits of the same field
- **WHEN** two devices change the same title offline and both sync
- **THEN** every device shows the title written with the greater timestamp, and the outcome is identical whichever device synced first

#### Scenario: Stale operation arrives late
- **WHEN** an operation older than the current value of a field is delivered after a newer one
- **THEN** the field keeps the newer value

### Requirement: Idempotent delivery
The server SHALL ignore an operation whose id it has already stored, and the client SHALL apply the same operation twice without changing state, so retries after a lost response are safe.

#### Scenario: Retry after lost response
- **WHEN** a client resends a batch because it never received the response
- **THEN** the server reports them as duplicates and the state is identical to a single delivery

### Requirement: Sync exchange
A single request SHALL push the client's pending operations and pull operations recorded after the client's cursor, excluding those authored by the requesting device. The response SHALL include the new cursor, whether more operations remain, and the server time. The client SHALL keep exchanging until the outbox is empty and no more operations remain.

#### Scenario: New device catches up
- **WHEN** a device with an empty cursor syncs
- **THEN** it receives every operation ever recorded for the user, including those created through the REST API, and ends with the same tasks and projects as the other devices

#### Scenario: Offline edits upload on reconnect
- **WHEN** a device made edits offline and the network returns
- **THEN** the pending operations are uploaded without user action and other devices receive them on their next exchange

### Requirement: Sync triggers and status
The client SHALL sync shortly after each local edit, when the network comes back, when the tab becomes visible, and periodically while open. It SHALL show whether it is synced, syncing, offline (with the count of pending changes), signed out, or in error, and SHALL let the user trigger a sync manually.

#### Scenario: Status while offline
- **WHEN** the device is offline with unsent edits
- **THEN** the indicator shows offline with the number of pending changes

### Requirement: Clock safety
Timestamps SHALL be strictly increasing per device even if the system clock moves backwards, and the server SHALL clamp timestamps more than five minutes in the future so a wrong clock cannot make a field unchangeable.

#### Scenario: Device clock far in the future
- **WHEN** a device with a clock one hour ahead syncs an edit
- **THEN** the stored timestamp is at most five minutes ahead of server time and later edits from correctly set devices can still win

### Requirement: Per-user isolation
Operations SHALL be stored and served per account; no user SHALL receive or affect another user's operations.

#### Scenario: Two accounts on one server
- **WHEN** two users sync against the same server
- **THEN** each receives only their own operations

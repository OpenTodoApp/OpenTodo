## MODIFIED Requirements

### Requirement: Per-tenant limits
In host mode, the operator SHALL be able to set limits per tenant on database size, operations per hour and in total, request rate, import size and number of members, with host-wide defaults. A write that would exceed a limit SHALL be refused with an error naming the limit, while reads and sync of existing data keep working. Moving items to the Trash SHALL stay possible at the storage limit. The request rate SHALL be counted per client address of each tenant (the address the server's rate limits use, IPv6 grouped by `/64`), so one client, signed in or not, cannot use up the tenant's requests for its other users.

#### Scenario: Database size limit
- **WHEN** a tenant reaches its database size limit and a device syncs a new task
- **THEN** that operation is refused with a reason naming the storage limit, the device keeps the task locally and marks it unsynced, and other devices are unaffected

#### Scenario: Request rate
- **WHEN** one client sends a tenant more requests in a minute than its limit
- **THEN** that client's extra requests are answered 429 with a code naming the request limit, and the next minute works again

#### Scenario: Flood from one client
- **WHEN** a client without an account sends a tenant more requests in a minute than its limit
- **THEN** that client gets 429 `limit_requests`, and requests from the tenant's other clients in the same minute are served

#### Scenario: Member limit
- **WHEN** a tenant has as many active accounts as its member limit and someone registers
- **THEN** the account is not created and the answer names the member limit

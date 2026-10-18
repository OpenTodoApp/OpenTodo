## ADDED Requirements

### Requirement: Batches by protocol revision
The MCP endpoint SHALL refuse a JSON-RPC batch with error `-32600` and HTTP 400 when the request's `MCP-Protocol-Version` is 2025-06-18 or later, since those revisions removed batching. A request without the header, or with 2025-03-26, MAY send a batch. Authentication is unchanged: a batch without a bearer token is refused like any other request.

#### Scenario: Batch under a newer revision
- **WHEN** an authenticated client sends a batch of two `ping` requests with `MCP-Protocol-Version: 2025-06-18`
- **THEN** the response is HTTP 400 with a JSON-RPC error `-32600` and neither request is answered

#### Scenario: Batch under 2025-03-26
- **WHEN** an authenticated client without the protocol header sends a batch of 20 `ping` requests
- **THEN** the response is an array of 20 replies

#### Scenario: Unauthenticated batch
- **WHEN** a batch is sent without a bearer token
- **THEN** the response is 401 as for any other request

### Requirement: Batch size and response budget
A batch SHALL hold at most 20 messages; a longer one SHALL be refused with `-32600` and HTTP 400 and none of it run. Once the replies of a batch reach 4 MB, the remaining requests SHALL NOT be run and each SHALL get a `-32603` error asking the client to send it on its own. Write calls that did run went through the op log and reach devices on sync like any other call.

#### Scenario: Oversized batch
- **WHEN** a client sends a batch of 21 messages
- **THEN** the response is HTTP 400 with error `-32600` and none of them runs

#### Scenario: Response budget
- **WHEN** a batch of `list_tasks` calls produces more than 4 MB of replies
- **THEN** the requests after the budget is reached each get error `-32603` and are not run

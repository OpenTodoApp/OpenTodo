## MODIFIED Requirements

### Requirement: Connection limits
The server SHALL cap concurrent streams per account; when the cap is exceeded it SHALL close the oldest stream for that account rather than refuse the new one, so a device that reconnects after a half-closed connection is never locked out. The cap SHALL be ten, so several tabs and devices coexist while one account (such as a demo sandbox) cannot hold more. The server SHALL also hold at most 20 streams per client address and 2,000 in all; a stream over either cap SHALL be refused with 503 `busy` and `Retry-After`, and the client keeps converging through its backoff and polling, since the stream carries no data.

#### Scenario: Stale connection replaced
- **WHEN** an account already has the maximum number of open streams and a device opens another
- **THEN** the new stream is accepted and the oldest one is closed; the closed client reconnects through its normal backoff

#### Scenario: Too many streams from one address
- **WHEN** one client address already holds 20 open streams, across any accounts, and opens another
- **THEN** the new stream is refused with 503 `busy` and `Retry-After`, while a client at another address can still connect

#### Scenario: Server-wide cap
- **WHEN** the server already holds its maximum number of streams and a device opens another
- **THEN** the stream is refused with 503 `busy`; once a stream closes, a new one is accepted

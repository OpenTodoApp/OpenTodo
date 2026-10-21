## MODIFIED Requirements

### Requirement: Public device ids are reserved
Operations whose device starts with `public:` (public links) or `page:` (task pages, OpenSpec change `task-pages`) SHALL be written only by the server for guests' ticks and replies. `POST /api/v1/sync` SHALL refuse a request whose device, or any submitted op's device, starts with `public:` or `page:` with 400 `invalid_op`, so a device cannot make its edits look like a guest's.

#### Scenario: Forged public device
- **WHEN** a device submits ops with device `public:abc`
- **THEN** the response is 400 `invalid_op` and nothing is stored

#### Scenario: Forged task page device
- **WHEN** a device submits ops with device `page:p1`
- **THEN** the response is 400 `invalid_op` and nothing is stored

## ADDED Requirements

### Requirement: Query limits
A query SHALL be at most 4,096 characters, counted as Unicode code points, and SHALL nest at most 64 levels, where each `(` and each `!` opens one level and sibling groups do not add up. The app and the server SHALL refuse a longer or deeper query with a syntax error, `Query is too long: N characters, at most 4096` or `Too deeply nested at position P; use at most 64 levels of "(" and "!"`, shown and handled like any other syntax error. The app SHALL apply the limits offline, without the server; the limits change no op or stored value, so convergence is unaffected. The server SHALL check the limits before parsing deeper, so no query can exhaust its stack, and `POST` and `PATCH /api/v1/views` SHALL answer a query over a limit with 400 `invalid_input` and the message, writing nothing.

#### Scenario: Too deep in the Filter view
- **WHEN** the user enters a query that opens 65 `(` before its first term
- **THEN** the message reads `Too deeply nested at position 65; use at most 64 levels of "(" and "!"` and the list below is unchanged

#### Scenario: At the limit
- **WHEN** the user enters `p1` inside 64 levels of parentheses with "Completed tasks: Show" on
- **THEN** the open and completed priority-1 tasks are listed

#### Scenario: An oversized query through the API
- **WHEN** a signed-in client posts a view whose query is three million `(` to `/api/v1/views`
- **THEN** the server answers 400 `invalid_input` with `view.query: Query is too long: 3000000 characters, at most 4096`, writes no view, and keeps serving requests

#### Scenario: Unauthenticated
- **WHEN** a client without a session or token posts a view to `/api/v1/views`
- **THEN** the server answers 401 and does not parse the query

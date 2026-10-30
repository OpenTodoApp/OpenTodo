## ADDED Requirements

### Requirement: Time sector in tools
`create_tasks` items and `update_tasks` updates SHALL accept `sector`: an absolute period (`YYYY-Www`, `YYYY-MM` or `YYYY-Qn`, OpenSpec `time-sectors`) or null. It SHALL be written exactly as sent, as one operation through the operation log, converging with device edits by per-field last-writer-wins. Relative words SHALL be refused, because a tool call has no viewer date. Task results of the read tools, the write tools and the `opentodo://` resources SHALL carry `sector` (`null` when empty), in plain text for encrypted accounts too. `list_tasks` SHALL accept a `sector` filter with an absolute period or `carried`, evaluated in the user's time zone with Monday weeks. An invalid or relative value SHALL be a `-32602` error naming the item and the field, and SHALL change nothing.

#### Scenario: Sector a batch
- **WHEN** an allowed assistant calls `update_tasks` with three updates setting `sector: "2026-W45"`
- **THEN** the three tasks show "Next week" on devices after sync, their due dates are as stored, and the history shows the change under the assistant

#### Scenario: Relative word refused
- **WHEN** an assistant sends `sector: "next week"`
- **THEN** the response is a `-32602` error naming the item and `sector`, and nothing changes

#### Scenario: Read
- **WHEN** an assistant calls `get_task` on a task with the sector `2026-Q1`
- **THEN** the result carries `sector: "2026-Q1"`

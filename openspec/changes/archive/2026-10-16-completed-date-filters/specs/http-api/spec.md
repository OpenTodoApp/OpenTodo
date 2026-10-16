# Spec Delta

## ADDED Requirements

### Requirement: Task list by completion time
`GET /api/v1/tasks` SHALL accept `completed_after` and `completed_before`, each a `YYYY-MM-DD` date (start of that day in the `timezone` parameter's zone, UTC by default), an RFC 3339 time or Unix milliseconds, and with either SHALL list only completed tasks completed in `[completed_after, completed_before)`. The route keeps its authentication. The parameters only filter synced rows, so offline behaviour and convergence are unchanged.

#### Scenario: Last week's completions
- **WHEN** a script requests `/api/v1/tasks?completed_after=2026-10-05&completed_before=2026-10-12&timezone=Europe/Zurich`
- **THEN** the response lists the tasks completed from 2026-10-05 00:00 to 2026-10-11 23:59 Zurich time, each with `completed_at` and `completed_by`, and no open task

#### Scenario: Invalid value
- **WHEN** a script requests `/api/v1/tasks?completed_after=last-week`, or passes `completed_after` to `/api/v1/projects`, or an unknown `timezone`
- **THEN** the response is 400 `invalid_input` naming the parameter

#### Scenario: Anonymous request
- **WHEN** the same request is sent without credentials
- **THEN** the response is 401 `unauthorized`

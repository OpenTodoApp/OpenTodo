# Spec Delta

## ADDED Requirements

### Requirement: Routine runs show their blocks
A routine run whose AI step showed blocks SHALL store them with its result as kind and checked parameters only. The routine inbox card and the run's detail SHALL render them with the assistant's block renderers from this device's rows, live and offline, read-only except ticking a task.

#### Scenario: Morning briefing
- **WHEN** a scheduled routine's AI step shows today's calendar and three tasks
- **THEN** the run in the routine inbox shows the day's agenda and the three task rows under its text

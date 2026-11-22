# Spec Delta

## MODIFIED Requirements

### Requirement: Nightly time benchmark
A nightly workflow SHALL build the server, generate the fixture, and measure every desktop, phone-profile and server budget five times, failing when a median exceeds its budget and reporting the failure through the nightly alert with the metric, the median and the budget. Each server run SHALL also time a fixed reference workload of the same kind as the server's work (SQLite reads through the server's driver and the JSON of their rows), whose code and data do not change with the app. A server budget in milliseconds or seconds SHALL be relative to the runner: the limit SHALL be multiplied by the reference workload's median in that benchmark over the reference's baseline in `scripts/perf/budgets.json`, and SHALL NOT exceed the published limit times the backstop in that file (1.5), so a regression cannot hide behind a slow runner. Memory and size budgets, and every desktop and phone-profile budget, SHALL stay absolute. Without a reference measurement the server limits SHALL be absolute. The alert of a relative budget SHALL name the published limit and the limit on that runner. `make perf` SHALL run the same benchmark locally. The app SHALL expose its measurement points only as entries in the browser's own performance timeline and SHALL NOT send them anywhere.

#### Scenario: Slower first sync
- **WHEN** a merged change makes the desktop first sync take a median of 41 s
- **THEN** the nightly benchmark fails and the alert names "first sync, desktop, 41 s, budget 30 s"

#### Scenario: A slower runner
- **WHEN** the reference workload takes 25 % longer than its baseline and listing the 2,000-task project takes a median of 200 ms against a 170 ms budget
- **THEN** that budget is 212.5 ms on this runner and the benchmark passes

#### Scenario: A regression on a slow runner
- **WHEN** the reference workload takes twice its baseline and listing the 2,000-task project takes a median of 300 ms
- **THEN** the budget on this runner is capped at 255 ms (170 × 1.5), and the alert names "REST list of the 2,000-task project, p95, server, 300 ms, budget 170 ms (255 ms on this runner)"

#### Scenario: Memory stays absolute
- **WHEN** the reference workload takes twice its baseline and the server's idle memory is 70 MB against a 60 MB budget
- **THEN** the benchmark fails: memory is not scaled

#### Scenario: No telemetry
- **WHEN** the benchmark runs the app with network logging
- **THEN** no request carries the measurement marks and the only requests go to the local server

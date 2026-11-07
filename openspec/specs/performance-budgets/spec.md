# performance-budgets Specification

## Purpose
The performance budgets of a 10,000-task account and how the benchmark measures them (the budgets themselves arrive with performance-10k).

## Requirements

### Requirement: Completion measured as an interaction
The nightly benchmark SHALL time completing a task in the 2,000-row list, on desktop and in the phone profile, as the browser measures an interaction for Interaction to Next Paint: the Event Timing entries (`PerformanceObserver` of type `event`, duration threshold 16 ms) of the input's interaction, grouped by interaction id, taking the longest entry's duration, which runs from the input to the next paint after its handlers (processing plus presentation). An interaction with no entry SHALL count as 16 ms. The budget SHALL apply to the 95th percentile of the ten completions of a run and the median of five runs, as for the other metrics. The benchmark SHALL check that the row's change was in the document by the interaction's paint and, when it was not, SHALL count the time to the frame after the change for that completion and say so in its log. It SHALL stop with an error in a browser without Event Timing. For at least one release it SHALL also report, without a budget, the earlier timer of the same completions (from the input to the frame after the change, then a task).

#### Scenario: A completion whose tick paints with the click
- **WHEN** the benchmark clicks a task's checkbox and the tick is in the document before the click's next paint
- **THEN** the sample is the click interaction's longest Event Timing duration

#### Scenario: A tick drawn a frame late
- **WHEN** the row changes only after the interaction's paint
- **THEN** that sample is the time from the input to the frame after the change, and the log names the completion as late

#### Scenario: Comparing with the earlier timer
- **WHEN** the nightly report is read
- **THEN** it holds the completion's budgeted interaction p95 and, marked as reported only, the earlier timer's p95 of the same completions

# Proposal: assistant-eval

## Why

The server can only check that the assistant's tools are *allowed and validated*. Whether a real model *uses them well* has so far been found out by hand. Right after `assistant-generative-ui` shipped, a real model answered "show my errands" with a list and claimed it had drawn a map. Every later change in this roadmap (blocks, memory, fewer tools per turn) changes model behaviour, so we need a repeatable way to measure it.

## What Changes

- **`make assistant-eval`:** recorded scenarios run against a real provider configured from the environment (provider, model, key). Each scenario is a seeded account and a question. The checks are about behaviour:
  - which tools were called, and with which ids;
  - no writes;
  - no repeated display call after a complaint;
  - no claim that a map appeared;
  - a `show_tasks` call for two or more tasks.
- **A report:** pass or fail per scenario, tokens used, and the model's answer, written to `eval-report/`.
- **Not in CI:** it costs tokens. It is run by hand before changes that touch the assistant's instructions or tools, and optionally on a schedule by the maintainer.
- **No product behaviour changes,** so the change has no specs (`skip_specs`).

## Capabilities

### New Capabilities

### Modified Capabilities

## Out of scope

- Grading wording or answer quality with another model ("LLM as a judge"). The checks are deterministic, about tool calls and simple text patterns.
- The on-device loop. It shares the instructions; a later version can drive it through the same scenarios.

## Roadmap

This is the foundation for the assistant roadmap (shipped AI row 3: `in-app-assistant`, `assistant-generative-ui`).

## Impact

- `scripts/assistant-eval/` (Node, no new dependency): scenarios, a seed through the REST API, a turn through `POST /api/v1/assistant/turn` against a throwaway server, and the report.
- A Makefile target, and a docs page for contributors.
- No new environment variable for the server. The eval reads `ASSISTANT_EVAL_*` itself.

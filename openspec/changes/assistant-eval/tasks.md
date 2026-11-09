# Tasks

## 1. Harness

- [ ] 1.1 `scripts/assistant-eval/run.mjs`: start a throwaway server, create the owner, configure the provider from `ASSISTANT_EVAL_*`, consent, seed through REST, post turns and collect the stream events. Verify with a dry run against `scripts/fake-llm.mjs` (`ASSISTANT_EVAL_PROVIDER=compatible`), where all scenarios scripted for it pass.
- [ ] 1.2 Expectation checks (tool calls by kind and id set, forbidden tools, forbidden text, change set yes or no) and majority voting over runs. Verify with `node --test scripts/assistant-eval/*.test.mjs` on recorded event fixtures.
- [ ] 1.3 Report (`eval-report/report.md`, `report.json`) and exit code. Verify that a failing fixture gives a non-zero exit and names the failed expectation.

## 2. Scenarios and docs

- [ ] 2.1 About 12 scenarios:
  - overdue tasks as `show_tasks`;
  - plan a day as `show_calendar`;
  - errands as `show_map`;
  - a complaint about a missing block means no repeat;
  - no map claims;
  - one task as a link;
  - a choice;
  - a project outline;
  - a week reschedule as a change set;
  - no writes on a question;
  - untrusted text ignored;
  - a kept-away project never shown.

  Verify by running against a real provider once and committing the first report summary to the PR.
- [ ] 2.2 `make assistant-eval` and `docs/assistant-eval.md` (contributors: how to run, cost, when to run). Verify with `make docs-check`.

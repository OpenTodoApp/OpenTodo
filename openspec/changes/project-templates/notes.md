# Implementation notes: project-templates

## Smoke test (5.1), 2026-10-15

Run against a throwaway server with Chromium through Playwright:

- **Save as template.** "Trip to Rome" (one section, two open tasks, one completed) downloaded as `opentodo-template-trip-to-rome.json` with `template.day` set to the day of saving and the two open tasks only.
- **Start it in a second account** with "From a template…" on 2026-12-01: both tasks were created in a new project, dates moved by the same number of days, and the 09:00 time kept.
- **Duplicate offline on a phone profile** of the first account: the copy opened at once with both tasks; after reconnecting, the server (and the laptop) listed "Trip to Rome copy".
- **The same file on the Import screen** showed the template hint with the From a template link.
- **A two-project, six-label template** (shaped like the website's `gtd-setup` download; the website itself is not reachable from this machine) created both projects and all six labels once.

## Decisions taken while implementing

- **`duplicateProject` and `duplicateTask` live in `lib/templates.ts`**, not `lib/ops.ts`: templates already imports the ops layer, so the reverse import would make a cycle.
- **Every date field shifts**: `due` as the spec says, and also `deadline` and a start date, by the same number of days, so a deadline keeps its distance from the plan. Someday stays Someday.
- **Blockers inside the copied tree are kept** (pointing at the copies) and blockers outside it are dropped (task-dependencies landed first).
- **Every label a template declares is created** when missing, used or not: a method set-up template brings its contexts. A duplicate only declares the labels its tasks use.
- **The project menu shows for viewers too**, with only Duplicate… and Save as template… (copies only read the project).
- **The From a template dialog host lives in the Shell**, so the Import screen's link opens it on every screen size.
- **Project notes** are not copied yet: `project-notes` has not landed; when it does, its fields join the tree.

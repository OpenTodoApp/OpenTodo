# Proposal

## Why

People leave a task app for three reasons: the price, sync or privacy, or a company that turned against them. Whatever the reason, they stay only if their tasks come with them. The research's retention section says long-term users stay where their data already lives (research §1). Its self-hosted section names the people OpenTodo should win: Vikunja users with broken iOS clients, Super Productivity users with conflict-prone folder sync, and Tududi users who want more than a calm list (research §1, "Self-Hosted Competitors"). OmniFocus 4 users who want sequential projects and review cycles (`project-flow-modes`, `project-review-cadence`) arrive with their own export.

Today OpenTodo reads ten named formats: Todoist, TickTick, Things, Linear, Google Tasks, Trello, Asana, Microsoft To Do, Apple Reminders and Any.do. Each has a switch guide in `docs/switch/` and real-export fixtures (`data-import` "Named formats are verified against real exports"). Five of the competitors in the 1.0 list have no path at all: OmniFocus, Vikunja, Notion, Super Productivity and Tududi. And the Import screen does not help someone who arrives saying "I use X". They have to find the right guide in the docs first.

1.0 should be the release where "can I bring my stuff?" has a tested yes for every competitor that matters.

## What Changes

- **Five new named formats**, each with real-export fixtures, a golden preview and a switch guide:

  | Format id | App | File |
  |---|---|---|
  | `omnifocus-csv` | OmniFocus 4 (Mac) | File → Export → CSV, UTF-8 |
  | `vikunja-export` | Vikunja 0.22 or later | the ZIP from Settings → Export your data |
  | `notion-csv` | Notion task databases | the "Markdown & CSV" export ZIP |
  | `super-productivity-json` | Super Productivity | Settings → Sync & Backup → Export data |
  | `tududi-db` | Tududi | a copy of its SQLite database file |

- **Notion column mapping.** Notion databases have user-defined columns. The preview proposes which column is the title, status, due date, labels, priority, project and notes, guessing from the column names and values. The person can change each choice before importing.
- **"Switching from…" on the Import screen.** The screen gains a picker of the 15 supported apps (the 14 competitors in the 1.0 list plus Linear). Choosing one shows that app's export steps inline from its switch guide, preselects the format, and links to the full guide. This is the "one-click" part: one choice, and the steps and the format are in front of you.
- **A migration matrix that CI keeps true.** `docs/switch/README.md` lists every competitor with:
  - its format id;
  - what carries over and what doesn't;
  - the date of the last real-export check.

  A repository check fails when a competitor in the list has no format id, no switch guide, no real-export fixture with a golden preview, or no row.
- **Re-verified fixtures for the existing ten.** Each existing format is re-exported from the current version of the app before 1.0. The golden files are updated, with any difference stated in the pull request.

No new op field. Imports write through the operation log with device `import`, as today. No new environment variable or dependency: `tududi-db` reuses the SQLite reader of `things-db`. Not **BREAKING**.

This change is larger than the usual M, because it has five importers. It is kept as one proposal so the matrix and the picker land with a complete list. The tasks are grouped per importer, and each importer can be implemented and merged as its own pull request.

## Out of scope

- **Importing over a competitor's API with a token.** Every path stays file-based. The server makes no new outbound request, which keeps AGENTS rule 5 unchanged.
- **Continuous sync with a competitor.** Issue import from GitHub and GitLab stays the only live source.
- **Formats of apps not in the list:** Taskwarrior, Donetick, Sunsama, Akiflow, Morgen and Motion. The generic JSON and CSV profiles and the documented CSV columns remain the path for them, and `docs/switch/README.md` says so.
- **The OmniFocus `.ofocus` backup and TaskPaper text.** CSV covers OmniFocus's hierarchy, dates, tags and flags. TaskPaper may follow if people ask.
- **Notion pages that are not database rows.**

## Roadmap

1.0 "Trust", row `migration-everywhere`. Advances ROADMAP.md §7 "Import and export".

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `data-import`: "Accepted import formats" gains five format ids. New requirements per format (structure, attributes and dates), "Notion column mapping", "Switching from another app" (the picker) and "Every listed competitor has a verified path" (the matrix and its check).

## Impact

- **Data model, sync, op schema:** none. Imports write ordinary ops with device `import`; offline devices receive them on their next sync and fields converge by last-writer-wins.
- **E2EE:** unchanged. As documented in `docs/e2ee.md`, an import writes plaintext like REST. The next unlocked device re-writes it as ciphertext ("encrypt-on-sight"). Name-based duplicate detection cannot match encrypted labels and projects. The picker shows that note on an encrypted account.
- **API:**
  - `POST /api/v1/import/preview` and `POST /api/v1/import` accept a `columns` option for `notion-csv` (additive).
  - The preview response gains `columns` with the guessed mapping.
  - No new route, so the route matrix is unchanged.
  - The format list stays a client-side list (`web/src/lib/types.ts`, `ImportScreen.tsx`).
- **CLI:** `ot import` accepts the new format ids through its existing `--format` flag.
- **MCP:** none.
- **Code:**
  - five `internal/importer/profile_*.go` files;
  - `Row` gains time entries for Super Productivity's tracked time;
  - fixtures under `internal/importer/testdata/`;
  - the picker in `web/src/app/ImportScreen.tsx`;
  - five guides in `docs/switch/` and the matrix.
- **Binary size:** about 60 KB for five profiles. Fixtures are test-only. Bundle: about 3 KB gzip for the picker; the steps are read from the existing `help.json`.

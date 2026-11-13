## ADDED Requirements

### Requirement: A token's workspaces in MCP
Over MCP, a token limited to chosen workspaces SHALL see and change only those workspaces through every tool and resource, as the REST routes do: `list_workspaces` SHALL list only them, a tool naming an item outside SHALL answer not found, new items SHALL land in the first chosen workspace, and tools over account-wide records (frames, slots, objectives, memories, reviews, routines) SHALL answer `token_restricted`. The OAuth consent page SHALL offer **All workspaces** (the default) or chosen workspaces, and every access token of the grant SHALL carry that choice, also after a refresh.

#### Scenario: An assistant for work
- **WHEN** an assistant connected with a token limited to Work calls `list_projects` and then `create_tasks` without a project
- **THEN** it sees only Work's projects and the task lands in Work's Inbox

#### Scenario: Consent with a choice
- **WHEN** a person connects Gemini and, on the consent page, chooses only Work
- **THEN** the minted access token and every refreshed one are limited to Work

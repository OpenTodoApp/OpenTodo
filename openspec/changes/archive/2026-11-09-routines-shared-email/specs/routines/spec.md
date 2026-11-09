## MODIFIED Requirements

### Requirement: A shared routine acts only in its project
A shared routine's run SHALL read only its project: Find tasks, filter queries, the schedule condition, due and overdue triggers and the trigger's task SHALL see only the project's tasks. Every planned write SHALL stay in the project (its tasks, its sections, its note and its tasks' notes and comments); otherwise the run SHALL fail before writing, naming the project. REST and MCP SHALL refuse at save a shared routine whose trigger, condition or steps name another project, name a label, or move tasks out of the project. Steps that act on personal things SHALL be unavailable in a shared routine with reason `not_in_shared`: Favourite, Set today's focus, Start and Stop timer, Tracked time, Create project, Update project, Create a project from a template, Create labels, Email me and Send a webhook. Email project members SHALL be available in a shared routine under the conditions of "Email project members". Event triggers of a shared routine SHALL fire on any member's changes to the project's tasks, except imports, undos, the routine's own batches and past the chain depth limit; `assigned.to_me` SHALL mean assigned to the run-as person.

#### Scenario: Anyone's change fires it
- **WHEN** Bob, an editor, adds a task to "Releases" whose routine "New task → due in 3 days" runs as Alice
- **THEN** the routine fires and the task gets its date, written with device `rule:<id>` and Alice as author

#### Scenario: Find stays in the project
- **WHEN** "Weekly chores", running as Alice, finds every open task due this week
- **THEN** it finds only Household's tasks, never Alice's personal ones

#### Scenario: Outside the project
- **WHEN** a shared routine's Change tasks step would move tasks to another project
- **THEN** saving it is refused as invalid with "a shared routine acts only in its project"

#### Scenario: Personal steps
- **WHEN** an editor opens Add step in a shared routine and searches "focus"
- **THEN** Set today's focus is listed dimmed with "Not available in a shared routine"

#### Scenario: Email project members offered
- **WHEN** outgoing email is configured, the editor's address is verified and they open Add step in a shared routine and search "members"
- **THEN** Email project members is offered and can be added

## ADDED Requirements

### Requirement: Email project members
In a routine of a shared project, the Email project members step SHALL send one plain-text routine email (`outgoing-email` "Routine email") to each member of the project, viewers included, whose account has a verified address, is not deactivated, is not end-to-end encrypted and has not stopped this routine's emails; members without a verified address SHALL be skipped. The step SHALL be available only while outgoing email is configured, the run-as person's address is verified and the instance is not a demo. Who receives SHALL be decided when the step plans and again when the run sends after its batches committed; only members on both lists SHALL get a message, so a member who left the project in between gets nothing. Each message SHALL be in the member's language and count as one email toward the routine's 10 and the run-as person's 20 emails a day and toward the sending limits of the mail service. When the step would pass the daily limits the step SHALL fail with `rate_limited` before anything of the run is written and no message SHALL be sent; a message refused when sending SHALL be recorded as `email.failed` and not sent. No recipient SHALL not be an error. The step's emails cannot be undone.

#### Scenario: Weekly summary to the household
- **WHEN** "Weekly chores", running as Alice in "Household" with members Alice (verified, English), Bob (verified, German) and Carol (no verified address), runs Email project members "This week" with the found tasks' titles
- **THEN** Alice gets the email in English and Bob in German, each with the routine's name, a link to the run and a link to stop emails from the routine, and Carol gets nothing

#### Scenario: Member who left
- **WHEN** Bob leaves Household between the routine's plan and its send
- **THEN** Bob gets no message and Alice's does not change

#### Scenario: Over the daily limit
- **WHEN** the routine already sent 9 emails today and its project has 2 members who would receive one
- **THEN** the run fails at the step with `rate_limited`, nothing is written and no message is sent

#### Scenario: Demo
- **WHEN** a visitor on a demo instance looks at the step in a shared routine
- **THEN** it is unavailable with reason `demo`

### Requirement: Stopping a routine's emails
Every message of Email project members SHALL carry its own stop link `/routine-emails/<secret>`, the secret being unguessable and stored only as a hash, valid for 365 days, and good only for stopping this routine's emails to this member. The page SHALL name the routine and nothing else about it, and stop only when the member presses **Stop emails**; from then on no run of that routine SHALL email that member. `GET /api/v1/routine-emails/{token}` SHALL answer `{routine, stopped}` and `POST /api/v1/routine-emails/{token}/stop` SHALL record the stop and answer the same with `stopped: true`, repeating it changing nothing. Both routes SHALL be public, the secret in the address being the credential, a session or token never standing in for it; an unknown or expired secret SHALL be answered `404 link_invalid`, rate limited per address; both SHALL be refused on a demo instance. A stop SHALL be audited as a settings change of the member (`routine_email`, from `on` to `off`) without the routine's name. Stops are server state, never synced or exported; the page needs a connection and stores nothing offline.

#### Scenario: Bob stops the emails
- **WHEN** Bob opens the stop link of a "Weekly chores" email and presses Stop emails
- **THEN** the page says he will get no more emails from "Weekly chores", and the next run emails Alice but not Bob

#### Scenario: A link scanner opens it
- **WHEN** a mail server's scanner fetches the stop link
- **THEN** nothing is stopped, because only the button stops

#### Scenario: Signed out, no credentials
- **WHEN** a request without a session asks `GET /api/v1/routine-emails/{token}` with a valid secret
- **THEN** it answers 200 with the routine's name, and a request with a wrong secret answers `404 link_invalid` whoever asks

#### Scenario: Too many guesses
- **WHEN** one address asks for 11 unknown secrets in a minute
- **THEN** the 11th answer is `429 rate_limited`

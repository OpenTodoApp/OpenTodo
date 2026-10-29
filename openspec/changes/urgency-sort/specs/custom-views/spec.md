## ADDED Requirements

### Requirement: Urgency order in views
A list view's display panel and the New view page SHALL offer **Urgency** in Order by, ordering within each group by score (OpenSpec `urgency-score`), highest first by default, with the direction under More options, equal scores by due date, priority, position and id, and the score shown as in `list-display-options` "Urgency score shown with its order". It SHALL be stored as the view's `sort_by` `urgency`, written as an operation that works offline and converges per field, and a client that does not know it SHALL show the view's default order without rewriting it. `/api/v1/views` SHALL accept `"sort_by":"urgency"` on create and patch with the same authentication and error rules as every other option, and the export SHALL carry it unchanged.

#### Scenario: A view by urgency
- **WHEN** the user orders the view `@home & unblocked` by urgency and groups it by project
- **THEN** each project's group lists its most urgent task first, and other devices show the same order after sync

#### Scenario: Same order before and after saving
- **WHEN** the user orders the New view page's results by urgency and saves the view
- **THEN** the saved view shows the same order

#### Scenario: Set through the API
- **WHEN** a script PATCHes `{"sort_by":"urgency","sort_dir":"desc"}` on a list view with a bearer token
- **THEN** the response is 200 with the view carrying both values, and devices order the view by urgency after their next sync

#### Scenario: Unauthenticated
- **WHEN** a request without credentials PATCHes `{"sort_by":"urgency"}` on a view
- **THEN** the response is 401 `unauthorized` and nothing is written

#### Scenario: Misspelled value
- **WHEN** a patch body sets `sort_by` to `"urgent"`
- **THEN** the response is 400 `invalid_input` naming `sort_by` and nothing is written

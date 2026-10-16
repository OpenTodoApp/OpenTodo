# Spec Delta

## MODIFIED Requirements

### Requirement: Collection endpoints
The API SHALL expose `projects`, `tasks` and `fields` collections with list, get, create, patch and delete. Lists SHALL exclude soft-deleted items unless `include_deleted=true` is given. Create SHALL return the stored entity with its generated id and defaults. A task SHALL carry its custom field values as a `fields` object keyed by definition id in every read, and accept the same object in create and patch (OpenSpec `custom-fields`); the per-field operations behind it SHALL NOT appear as separate keys.

#### Scenario: Create a task via the API
- **WHEN** a script POSTs `{"title":"Buy milk"}` to `/api/v1/tasks` with a bearer token
- **THEN** the response is 201 with the task including `id`, `priority` 4, `created_at`, `position` and an empty `fields` object

#### Scenario: Patch rejects unknown fields
- **WHEN** a PATCH body contains a field that is not part of the entity schema
- **THEN** the response is 400 with code `invalid_input` and nothing changes

#### Scenario: Delete is a tombstone
- **WHEN** a DELETE succeeds
- **THEN** the response is 204, a subsequent GET of that id is 404, and the item is still present in the export with `deleted_at` set

#### Scenario: Patch a custom field value
- **WHEN** a script PATCHes `/api/v1/tasks/{id}` with `{"fields":{"<cost-id>":120}}`
- **THEN** the response is 200 with `"fields":{"<cost-id>":120}` merged into the task's existing values, one operation is recorded for that field only, and devices receive it on their next sync

#### Scenario: Unknown definition id
- **WHEN** the `fields` object names an id that is no live definition of the task's project
- **THEN** the response is 400 `invalid_input` naming the id and nothing changes

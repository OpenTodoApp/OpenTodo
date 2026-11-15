# api-description Specification

## Purpose
A generated OpenAPI 3.1 description of the whole v1 REST API, kept current by the tests, for client generators, API explorers and agents.

## Requirements

### Requirement: A generated description of the v1 REST API
The repository SHALL contain an OpenAPI 3.1 description of every route under `/api/v1/`, generated from the server's route table and its handlers, never edited by hand. It SHALL state for each route its method and path with path parameters, the authentication it accepts, its request body and response body schemas as far as the handlers declare them, its success statuses, the shared JSON error envelope with the error codes the route can answer, and, for a deprecated route, that it is deprecated with its sunset date and replacement. Entities shared by several routes (tasks, projects, sections, labels, notes and the other collections) SHALL be described once and referenced. The description SHALL validate as OpenAPI 3.1. The description covers routes, not data: it is the same on every server of one release and SHALL hold no account data, no owner setting and no secret.

#### Scenario: A new route appears in the description
- **WHEN** a contributor adds a route under `/api/v1/` and runs the Go tests without updating the description
- **THEN** the description test fails, naming the route, and the update command adds it

#### Scenario: Task routes are described with their fields
- **WHEN** a client reads the description of `POST /api/v1/tasks`
- **THEN** the request schema lists the task fields with their types, `title` and the other fields as the handler accepts them, the response is the shared task schema, and the error responses use the `{error:{code,message}}` envelope

#### Scenario: A token scope is refused
- **WHEN** the description is read for a route that refuses `read` tokens
- **THEN** that route states which token scopes it refuses and which authentication it accepts

### Requirement: The description is served and published
The server SHALL serve the description of its own release at `GET /api/v1/openapi.json` without signing in, with caching headers and compression for clients that accept it. Every release SHALL publish the same file as a release asset and in the site bundle, so the website links the description of the release it pins. The route SHALL answer the same on a demo instance.

#### Scenario: Reading the description without an account
- **WHEN** a client without a session or token requests `GET /api/v1/openapi.json`
- **THEN** the server answers 200 with the description of its release, whose `info.version` is the server's version

#### Scenario: A method the route does not have
- **WHEN** a client sends `POST /api/v1/openapi.json`
- **THEN** the server refuses it with a 4xx answer in the JSON error envelope and changes nothing

#### Scenario: Offline and sync
- **WHEN** a device is offline
- **THEN** nothing in the app depends on the description; it is read by tools, not by the app, and no op or synced data is involved

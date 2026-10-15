# Spec Delta

## ADDED Requirements

### Requirement: Attachments refused on the demo
With demo mode on, every request to `/api/v1/attachments`, `/api/v1/tasks/{id}/attachments` and `/api/v1/settings/attachments`, for every method, SHALL be refused with 403 `demo_restricted` before authentication, so the public instance never stores or serves visitor files. `GET /api/v1/me` SHALL report `attachments.enabled: false` there and the app SHALL hide every attachment control and the capture screen's file list.

#### Scenario: Upload refused
- **WHEN** a demo sandbox uploads bytes to an attachment's content route
- **THEN** the response is 403 `demo_restricted` and no file is stored

#### Scenario: Controls hidden
- **WHEN** a sandbox opens a task's detail or the capture screen with a shared file
- **THEN** no attachment control is offered and the shared file is dropped with a note that attachments are off on the demo

#### Scenario: Demo mode off
- **WHEN** demo mode is off
- **THEN** the attachment routes behave as on any instance

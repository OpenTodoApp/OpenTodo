---
title: Host mode (many servers in one process)
summary: For operators of a hosted OpenTodo service: one process serves many independent tenants by host name, opened on demand, with one scheduler, per-tenant limits and an operator interface.
audience: admin
specs: [multi-tenant-host]
screens: []
order: 70
---
# Host mode

Host mode lets one OpenTodo process serve many independent **tenants**: a household, a team or a person, each with its own accounts and data. It is meant for a hosted service. A self-hosted server needs none of it, and without the variables below nothing changes.

Each tenant is an ordinary data directory, exactly like a self-hosted server's. It can be exported as a backup archive and restored into a self-hosted server with `opentodo restore`, and a self-hosted server's archive can become a tenant. Leaving the hosted service takes one download.

## How it works

- **Routing.** Tenant `smith` of `https://example.cloud` answers at `https://smith.example.cloud`. A host name that names no tenant, or a deleted one, answers `404` and does not say whether it ever existed. A suspended tenant answers `503`.
- **Opened on demand.** A tenant's database is opened on its first request, which also runs pending migrations, and closed after it has been idle (10 minutes unless changed). A device with a live update stream keeps it open. At most `OPENTODO_HOST_MAX_OPEN` tenants are open; at the cap the least recently used idle one closes first.
- **Failures stay local.** When a tenant cannot be opened (for example a migration fails), that tenant answers `503`, the error is shown to the operator (`lastError`), and every other tenant keeps working. The next attempt is made after a minute.
- **One scheduler.** Reminders, scheduled backups, Trash retention, audit pruning, webhook deliveries, calendar subscriptions, issue connection polls (only while the tenant's owner switch is on) and weekly digests run from one scheduler. Each tenant records when its work is next due; the scheduler opens only tenants with due work, so thousands of idle tenants cost nothing. Reminders go out within the same 30 seconds as on a self-hosted server.
- **Operator settings.** Outgoing email (`OPENTODO_SMTP_*`), single sign-on (`OPENTODO_OIDC_*`), backup destinations (`OPENTODO_BACKUP_*`), the MCP switches (`OPENTODO_MCP`, `OPENTODO_MCP_WRITES`), sign-up (`OPENTODO_ALLOW_SIGNUP`), attachment limits and the webhook network policy belong to the operator. Tenants cannot change them: their routes answer `403 host_managed`, and the app hides those panels. Email to task is off on a host. Each user still opts in to the weekly digest, sent through the operator's email. The assistant settings are read-only for tenant owners. Each tenant writes backups under its own name at the operator's destination.
- **Rolling updates.** Several host processes may serve the same directory, as for one server: only one runs the scheduler, the other takes it over when it stops.

## Configuration

All variables are optional; `OPENTODO_HOST_URL` turns host mode on.

| Variable | Meaning |
| --- | --- |
| `OPENTODO_HOST_URL` | The address tenants live under, such as `https://example.cloud`. Point a wildcard DNS record and certificate (`*.example.cloud`) at the server |
| `OPENTODO_HOST_TOKEN` | The operator token, at least 32 characters. Required in host mode |
| `OPENTODO_HOST_OPERATOR_ADDR` | Where the operator interface listens (default `127.0.0.1:8081`). Keep it on a private network |
| `OPENTODO_HOST_IDLE_MINUTES` | Minutes before an idle tenant closes (default 10) |
| `OPENTODO_HOST_MAX_OPEN` | Most tenants open at once (default 500) |
| `OPENTODO_HOST_LIMITS` | Default limits for every tenant, such as `db_mb=500,ops_per_hour=5000,members=10` |

`OPENTODO_DATA_DIR` holds the registry (`host.db`) and one directory per tenant under `tenants/`. Use an empty directory: host mode refuses one that holds a self-hosted server's database. `OPENTODO_BASE_URL` is ignored, and host mode cannot be combined with `OPENTODO_DEMO`. The container health check answers on the bare address.

## Limits

| Key | Limit | When reached |
| --- | --- | --- |
| `db_mb` | Database size in MB | New changes are refused with `limit_storage`; moving things to the Trash still works |
| `ops_per_hour` | Changes stored per hour | Refused with `limit_ops_hour` until the hour has passed |
| `ops_total` | Changes stored in total | Refused with `limit_ops_total` |
| `requests_per_minute` | Requests per minute | `429 limit_requests` |
| `import_mb` | Size of an import file | `413 limit_import` |
| `members` | Active accounts | New accounts are refused with `403 limit_members` |
| `workspaces` | Workspaces one account owns (at most 20) | `409 limit_reached` |
| `workspace_members` | Members of one workspace (at most 200) | `409 limit_reached` |
| `workspace_groups` | Groups of one workspace (at most 50) | `409 limit_reached` |
| `group_members` | Members of one group (at most 100) | `409 limit_reached` |

`0` or a missing key means no limit (for the four workspace keys: the built-in maximum, which a value can only lower). Changes are refused one at a time: the rest of a device's changes still sync, the refused ones stay on the device, marked as waiting, and are sent again later. Reads always work.

## Operator interface

Every request needs `Authorization: Bearer <OPENTODO_HOST_TOKEN>`; anything else answers `401` and names no tenant. It is never reachable through a tenant's host name.

| Method and path | What it does |
| --- | --- |
| `GET /operator/v1/tenants` | Every tenant with its state, limits, open state and last error |
| `POST /operator/v1/tenants` | `{"name": "smith", "limits": {...}}` creates an empty tenant. The answer carries `setupToken` and `setupUrl`: the first account needs the token, and the URL fills it in |
| `PUT /operator/v1/tenants/{name}/archive` | Creates a tenant from a backup archive (the request body). Send an encrypted archive's passphrase in `X-Archive-Passphrase`; without it the answer is `422 passphrase_required` |
| `GET /operator/v1/tenants/{name}` | One tenant |
| `PATCH /operator/v1/tenants/{name}` | `{"limits": {...}}` replaces the tenant's limits |
| `POST /operator/v1/tenants/{name}/suspend` | Suspends it: `503` with its data kept |
| `POST /operator/v1/tenants/{name}/resume` | Resumes a suspended tenant |
| `GET /operator/v1/tenants/{name}/archive` | Downloads the tenant as a backup archive |
| `DELETE /operator/v1/tenants/{name}` | Removes its data directory. The name stays reserved for 30 days |

Names are 1 to 63 lowercase letters, digits and inner hyphens; common service names such as `www`, `api` and `mail` are reserved.

## Owners take their data away

On a hosted server the owner finds **Settings → Server → Download your data**: the whole server as one backup archive. To move to a self-hosted server, restore it there with `opentodo restore` (see [Backups](../backups.md#restore-from-the-command-line)), start the server, sign in with the same credentials and point the devices at the new address.

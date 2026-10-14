# Tasks

## 1. Server

- [x] 1.1 `internal/config`: optional `OPENTODO_SETUP_TOKEN` (min. 16 characters when set); verify `TestSetupTokenValidation` (`go test ./...`)
- [x] 1.2 `internal/auth` + `internal/httpapi`: first registration requires the token when configured (constant-time, shared limiter, `setup_token_invalid` 403), `setupTokenRequired` in `auth/status`; verify `TestRegisterSetupToken*` covering missing, wrong, correct and after-setup cases (`go test ./...`)

## 2. Web

- [x] 2.1 Setup screen: token field and hint when `setupTokenRequired`; verify a vitest for the screen (`npm test`, `npm run build` in web/)

## 3. Deployment and docs

- [x] 3.1 `deploy/coolify/opentodo.yaml` (and upstream copy): `OPENTODO_SETUP_TOKEN=${SERVICE_PASSWORD_SETUP}`; `scripts/coolify-template-check.mjs` accepts it; `docker-compose.yml` references it empty; verify `make coolify-check` and `make coolify-smoke` (smoke registers with the token)
- [x] 3.2 Docs: `docs/self-hosting/coolify.md` (First visit), `docker.md`, README configuration table, CHANGELOG; verify `make check`

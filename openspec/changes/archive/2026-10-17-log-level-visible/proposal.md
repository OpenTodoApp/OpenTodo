## Why

`OPENTODO_LOG_LEVEL=debug` works, but debug only adds one line per API request. A log read right after a restart, before the app has made a request, looked the same at `debug` as at `info`, and nothing in it named the level. On Unraid this read as "the variable is ignored" (issue #128).

## What Changes

- The startup line (`opentodo listening`, and `opentodo host listening` in host mode) ends with `log_level=<level>`.
- At `debug`, a first debug line says what debug adds: one line per API request (method, path, status, duration).
- README and the Unraid template describe the same.

## Impact

`cmd/opentodo/main.go`, `cmd/opentodo/host.go`, README, Unraid template. No configuration or API change.

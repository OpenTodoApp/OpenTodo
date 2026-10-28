## Context

The lock file is the first thing the server writes in the data directory (`internal/store/lock.go`), so a permission problem always surfaces there first, for the server and the maintenance commands alike.

## Decisions

- Recognise `fs.ErrPermission` from creating the directory or opening the lock file and return an error whose text explains the fix with the process's own uid and gid (`os.Getuid`, `os.Getgid`; on Windows, where they are -1, the ids are left out). Other errors keep their text.
- The command names "the folder mounted at <dir>" because inside a container the host path is unknown.
- The link points to `docs/self-hosting/docker.md#bind-mounts`, which every platform guide refers to.

No data model change, no dependency, no measurable size change.

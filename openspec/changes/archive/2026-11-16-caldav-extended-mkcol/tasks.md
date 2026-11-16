## 1. Server

- [x] 1.1 Route `MKCOL` to the calendar creation handler with a calendar `resourcetype` check (403 `valid-resourcetype` otherwise)
- [x] 1.2 Add `extended-mkcol` to the `DAV` header and `MKCOL` to `Allow`
- [x] 1.3 Tests: extended `MKCOL` creates the project with its name and colour; a taken name answers 405; a plain or non-calendar `MKCOL` answers 403; the headers

## 2. Docs

- [x] 2.1 `docs/caldav.md`: supported methods and creating a list

## 1. The check

- [x] 1.1 `buildNews` fails when `news/` is empty and the changelog has a released section, naming the newest one; an empty folder before the first release still passes. Verified by `node --test scripts/news-check.test.mjs` ("with no news file, the newest release needs its entry").

## 2. The first entry

- [x] 2.1 `news/1.11.0.md` from the 1.11.0 summary, the generated files rebuilt, `RELEASING.md` and `news/README.md` updated. Verified by `make news-check`.

## 3. Check

- [x] 3.1 `openspec validate --all --strict`, `make news-check`, `make docs-check`.

## 1. The check

- [x] 1.1 `buildNews` fails while the newest released section has no entry, and refuses an entry for a version the changelog has not released; an empty folder before the first release still passes. Verified by `node --test scripts/news-check.test.mjs` ("with no news file, the newest release needs its entry", "the newest release needs its entry even when the series started after it", "an entry for a version the changelog has not released is refused").

## 2. The first entry

- [x] 2.1 `news/1.11.0.md` from the 1.11.0 summary, the generated files rebuilt, `RELEASING.md` and `news/README.md` updated. Verified by `make news-check`.

## 3. Check

- [x] 3.1 `openspec validate --all --strict`, `make news-check`, `make docs-check`.

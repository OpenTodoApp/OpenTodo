# Tasks

## 1. The kit in the bundle

- [x] 1.1 Extend `scripts/site-bundle.test.mjs` first: `brandFiles()` holds `kit/<path>` for every brand-script output under `brand/`, byte-identical to the repository's file, and no other `kit/` entry; the existing five files are unchanged. Verify it fails (`node --test scripts/site-bundle.test.mjs`).
- [x] 1.2 Add the kit to `brandFiles()`, create nested folders when the bundle is written, and name `brand/kit/` in the bundle README. Verify that `node --test scripts/site-bundle.test.mjs` passes, and that a local bundle (`node scripts/site-bundle.mjs <dir>`) has `brand/kit/png/avatar-512.png`.
- [x] 1.3 Add a CHANGELOG entry under Unreleased naming the new `brand/kit/` bundle path, as "Stable bundle layout" requires for any new path. Verify it is in `CHANGELOG.md`.
- [x] 1.4 Run `make check` and `make openspec-validate`. Verify both pass.

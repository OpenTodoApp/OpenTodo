## 1. Service worker

- [x] 1.1 `shareRequestVerdict` (`store`, `refused`, `unverified`) in `web/src/lib/shareInbox.ts`; `sw.ts` stores only `store`, sends `unverified` to `/share?files=unverified`; `shareInbox.test.ts` ("stores only a share that says where it came from…", the older case now refused); verify `npm test` in web/

## 2. Capture screen

- [x] 2.1 `files=unverified` mode and its note, in all six catalogues; `shareCaptureFiles.test.tsx` ("explains a share the service worker did not keep…"); verify `npm test`, `make i18n-check`

## 3. Docs and checks

- [x] 3.1 `docs/capture.md`, threat model web client section; CHANGELOG `### Security`; tick 6.8 in `external-security-review`; verify `make docs-check`, `make openspec-validate`, `npm run build` in web/

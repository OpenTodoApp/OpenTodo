## 1. Android shell

- [x] 1.1 `Bridge.kt` lists `first-paint` with a screen only, has `painted` in the page script and passes it to the host; verified by `BridgeFixtureTest` (`firstPaintFollowsTheFixture`, `capabilitiesOfTheVisibleAppAndOfABackgroundRun`, `thePageScriptHasTheMethodsOfTheNewCapabilities`) in CI's Android job
- [x] 1.2 `MainActivity`: the hold makes the web view transparent instead of invisible, and `painted()` reveals; verified by the instrumented tests `thePagesFirstFrameShowsTheWebViewBeforeItsLoadEnds` and `theWebViewShowsOnceThePageHasLoaded` in CI's emulator job

## 2. Fixture

- [x] 2.1 `capabilities.json` lists `first-paint` as visible only and `painted` among the methods; verified by `npx vitest run src/lib/shellBridge.fixture` in web/

## 3. Check

- [ ] 3.1 `make check`; CI's Android job (unit, lint, build, emulator) green; a device row on the owner's check list, after the iPhone check for #1757

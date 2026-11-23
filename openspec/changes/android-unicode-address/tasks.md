## 1. Fixture

- [x] 1.1 `server-address/cases.json` holds every address case of the Android and iPhone suites, with the local and non-local hosts; checked against a Java port of the Android rules (48 cases)

## 2. Android shell

- [x] 2.1 `ServerAddress.parse` sends a Unicode host in its ASCII form and refuses a port outside 1 to 65535; verified by `ServerAddressTest` (`sharedCases`, `localHosts`) in CI's Android job

## 3. iPhone shell

- [x] 3.1 `ServerAddressTests` read the fixture (`testSharedCases`, `testLocalHosts`); the Punycode encoder keeps its own test; verified in CI's iOS job

## 4. Check

- [ ] 4.1 `make check`; CI's Android and iOS jobs green

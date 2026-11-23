## 1. Fixture

- [x] 1.1 `microphone/cases.json`: the server's page, the same origin written differently, the camera with and without the microphone, a sign-in provider, plain http, another port, a look-alike host

## 2. Android shell

- [x] 2.1 `WebMicrophoneTest` reads the fixture (`requestsFollowTheSharedCases`); no code change

## 3. iPhone shell

- [x] 3.1 `MediaCapture.grants` and the `WKUIDelegate` capture decision in `ShellController`; the sign-in sheet refuses every request
- [x] 3.2 `MediaCaptureTests` read the fixture, and check the port 0 WebKit reports for a default port

## 4. Check

- [ ] 4.1 `make check`; CI's Android and iOS jobs green

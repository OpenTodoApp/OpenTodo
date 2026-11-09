## 1. Strict within the limits

- [x] 1.1 Server: `fitsAnthropicStrict` (20 tools, 24 optional parameters) decides `strict` per request; tests for both sides of each limit and the in-app tool set
- [x] 1.2 Device: the same rule in `assistantDevice/providers.ts`, with tests
- [x] 1.3 Log a provider-refused turn with status and error type

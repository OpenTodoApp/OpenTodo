# Proposal

## Why

On the iPhone app, links do nothing ([#1574](https://github.com/OpenTodoApp/OpenTodo/issues/1574), [#1534](https://github.com/OpenTodoApp/OpenTodo/issues/1534)), the Today widget stays at "Open OpenTodo to fill this widget" ([#1563](https://github.com/OpenTodoApp/OpenTodo/issues/1563)), and reminders and the test notification never arrive ([#1569](https://github.com/OpenTodoApp/OpenTodo/issues/1569)). It happens on 1.4.1 and 1.4.2 (the App Store build), and on main.

The bridge exists on the page: its page-side check uses `location.origin`. But the message handler refuses every call. It compares the frame's security origin with the configured server as `scheme://host:port`, and WebKit reports the scheme's own default port as **0** in `WKSecurityOrigin.port`, because WebKit keeps no port for it. The configured `https://host` gives 443, so `https://host:0` never equals `https://host:443`, and every server on its standard port, which is nearly every server, is answered `refused`. The unit tests passed 443 for the frame, which WebKit never reports, and the in-shell test serves on a random port.

## What Changes

- The origin signature built from the parts WebKit reports reads port 0 as the scheme's own default (443 for `https`, 80 for `http`). It never reads it as another port, so `https://host:8443` and `https://host:80` stay other origins.
- No web app, server, op-log or bridge contract change. Not **BREAKING**. Users get the fix with a new App Store build.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `native-shells`: "The iOS bridge exists on every server" says how the message handler reads the reported port.

## Impact

- `mobile/ios/OpenTodo/Origin.swift`: `signature(scheme:host:port:)`.
- `mobile/ios/OpenTodoTests/ShellDataTests.swift`: the default port as WebKit reports it.
- No size impact.

# Proposal

## Why

Two reports on the iPhone app's first-run screen:

- [#1137](https://github.com/OpenTodoApp/OpenTodo/issues/1137): **Connect** looks greyed out even once an address is typed. The button is a plain Form row drawn in the app's accent, a dark slate teal (`#255260`). On a dark-mode row that is about 2:1, the same as a disabled control, and in light mode it is a muted blue-grey easily read as inactive. It is also enabled for any text at all, well-formed or not.
- [#1136](https://github.com/OpenTodoApp/OpenTodo/issues/1136): an address typed without a scheme leaves the person wondering whether the app uses http and follows a redirect. Today it never does: the app adds `https://` itself, checks `/api/v1/health` over https without following redirects and stores that https origin, but nothing on the screen says so, and nothing in the app shows the address afterwards. A local http address is accepted without the "not encrypted" warning the spec asks for.

## What Changes

- **Connect** is a filled button: active (the accent fill) as soon as the address is well-formed, inactive (and read by VoiceOver as dimmed) while it is empty or unusable. Return on an unusable address still says why.
- The field shows the scheme. Its placeholder is `https://todo.example.com`; an address typed without a scheme becomes `https://…` in the field when the person leaves it or taps Connect, and the field then shows the normalised origin the app will use.
- Plain `http` is used only when typed. A local `http` address shows "This connection is not encrypted." under the field while it is typed; a public one is still refused with the https offer.
- A host typed in Unicode (`bücher.example`) is sent in its ASCII form (`xn--bcher-kva.example`) on every iOS version.
- Settings → About shows the exact server address under the "OpenTodo for iOS" (or Android) row, so it can be checked later without reinstalling.
- One new string, translated into the app's six languages.

No server, op or bridge change. Not **BREAKING**.

Out of scope: the Android first-run screen (its button and its warning already work this way), a sub-path in the address (still refused), changing the app's accent colour.

Roadmap: a fix to `ios-shell` and `ios-distribution` (the iPhone app in TestFlight and the App Store).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `native-shells`: the iOS first-run screen shows the address it uses, scheme included, and Settings → About shows it after connecting.

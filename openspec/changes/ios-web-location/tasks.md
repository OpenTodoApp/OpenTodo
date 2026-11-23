## 1. iPhone shell

- [x] 1.1 `NSLocationWhenInUseUsageDescription` in `project.yml` and `Info.plist`, translated in `InfoPlist.xcstrings` (de, es, fr, it, nl, pt, zh) with the web app's "Use my location" label
- [x] 1.2 `WebLocation`: the document-start script in every frame that refuses `navigator.geolocation` outside the configured server's origin; installed in the shell, and refusing everything in the first-run sign-in sheet and the background run

## 2. Tests

- [x] 2.1 `WebLocationTests` (JavaScriptCore, a `Navigator` with WebKit's configurable prototype accessor): the server's page keeps WebKit's geolocation; another host, a look-alike host, another port, plain http and an opaque origin are refused with code 1, also through the prototype's getter and after defining it back; without a server every page is refused

## 3. Check

- [x] 3.1 `openspec validate ios-web-location --strict`

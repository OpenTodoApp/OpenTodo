# Design

## Context

What the code did before this change:

- **Android.** `Theme.OpenTodo` is DayNight with a plain `windowBackground`. `MainActivity` sets its layout at once: an opaque root, coloured with the remembered bar colour (`Prefs.systemBars`), and a web view that is white until the page paints. From Android 12 the system shows its own splash screen, the launcher icon over the window background colour, but only until the activity's first frame, which is that empty web view.
- **iOS.** `UILaunchScreen` is an empty dictionary. `ShellController` gives the web view the remembered bar colour as its background before the page draws: in the default light theme that is the accent, a full green screen before the grey page.
- **Web.** `App` shows eight skeleton rows while it asks the server who is signed in. The shell's phone bar (`Shell.tsx` `PhoneBar`) and the tab bar (`TabBar.tsx`) come with the shell.

The module is AndroidX-only (`checkDependencies`), the iOS project file is committed and not regenerated in CI, and neither Kotlin nor Swift can be compiled where this change was written.

## Goals / Non-Goals

**Goals:** no blank screen between the icon and the page on either platform; no layout move between the skeleton and the app on a phone; no dependency, no string, no bridge change.

**Non-Goals:** an offline start for the iOS store build; new text on the error or first-run screens; a launch colour that follows the user's theme; an animated splash.

## Decisions

### D1. One colour on both platforms: the web app's default canvas

The launch colour is the default theme's canvas: `#eef0f2` light, `#0d0e10` dark (the dark one is `DARK_BAR`, already the installed web app's splash colour). Android: `@color/launch_background` in `values` and `values-night`. iOS: `LaunchBackground.colorset` with a dark appearance. A repo check keeps the two pairs equal and the dark one equal to the web manifest's.

It follows the phone's appearance, not the user's theme: a launch screen is drawn by the system from static resources before any code runs. With the default theme the page's own canvas is this colour, so the handover changes no colour. A custom theme, or a dark theme under a light phone, changes colour once, when the page shows.

**The remembered bar colour** (`Prefs.systemBars`) is still read at launch and still applied before the page draws. What changes is when it becomes visible: with the page, not before it. Over the launch screen the bars are the system's. Before, the remembered colour filled the screen (iOS) or the bars (Android) around an empty web view; that empty state is what this change removes.

### D2. Android: the window background is the launch screen

`MainActivity` gets its own theme, `Theme.OpenTodo.Launch`; the first-run and sign-in activities keep `Theme.OpenTodo`, whose plain background their forms need.

- **Before Android 12** the theme's `windowBackground` is `@drawable/launch`: a layer list of the colour and the adaptive launcher icon, 96 dp, centred. The system shows it as the starting window, and the activity shows the same pixels as long as nothing covers its window.
- **From Android 12** (`values-v31`) the system's splash screen is the launch screen: `windowSplashScreenBackground` is the colour and `windowSplashScreenAnimatedIcon` the launcher icon. `windowBackground` there is the plain colour, so no second, differently sized icon sits behind the system's.

No `androidx.core:core-splashscreen`: the platform attributes and one listener do what it would.

### D3. Android: held until the page can be drawn

While the hold lasts, the root has no background and the web view is `INVISIBLE`, so the window's background shows through. From Android 12, at a cold start, a pre-draw listener on the root also holds the first frame back, which is the platform's documented way to keep its splash screen up (`SplashScreen.setKeepOnScreenCondition` exists only in the AndroidX library, which does exactly this).

The hold ends, and `reveal()` gives the root its colour, applies the bars asked for meanwhile and shows the web view, at the first of:

1. the page ready to be drawn: `onPageFinished` of a main frame that did not fail, then `WebView.postVisualStateCallback`. The platform documents this for a web view kept invisible until its content is ready;
2. 500 ms after that `onPageFinished`, in case the callback is late;
3. an error screen (`showError`) or the Change server dialog;
4. five seconds after the start.

`onPageCommitVisible` was considered and dropped: it fires when the response body starts, before the app's script has drawn anything, so it would reveal an empty page.

The times live in `LaunchHold`, a class without Android types, with unit tests. After the first-run screen the hold starts again without the pre-draw listener (no system splash screen is showing then).

### D4. iOS: a colour, and the web view hidden over it

`UILaunchScreen` names the colour (`UIColorName`), in `project.yml` and in the checked-in `Info.plist`. No image: the asset catalog has only the app icon set, which a launch screen cannot use, and Apple's guidance is a launch screen that looks like the first screen, without a logo.

`ShellController` starts its web view at alpha 0; `ShellView` paints the launch colour behind it. `reveal()` fades it in (0.2 s) at `didFinish`, at a recorded load failure, or after five seconds. Alpha, not `isHidden`: WebKit keeps a page in a visible view running at full speed. While hidden, the status bar icons are the system's; the remembered ones come with `reveal()`, through the same `StatusBar.show` the root controller already answers from, so `StatusBarController` is untouched. The failure view is an overlay above the web view and shows as before.

### D5. Web: the skeleton takes the chrome's frame from the chrome

`web/src/app/phoneFrame.tsx` holds the class strings that place and size the phone bar and the tab bar (`PHONE_BAR_FRAME`, `PHONE_BAR_LINE`, `TAB_BAR_FRAME`, `TAB_FRAME`), the rule for which routes have the tab bar (`hasPhoneChrome`, moved out of `Shell`), and `PhoneFrameSkeleton`, which wraps `App`'s loading rows. `Shell` and `TabBar` use the same constants, so a change to the chrome changes the skeleton with it; a test renders both and compares.

- The bar's shape holds one block in the menu button's box (40 px, 44 px on a touch screen). The tab bar's shape holds four disabled `<button>` elements: the global touch rule that sizes a real tab sizes them too.
- The shapes are still and `aria-hidden`; the rows pulse and carry the status.
- They show only when `localStorage` holds `opentodo.user` (the same key `App` already uses to decide an offline start), so the sign-in screen is not preceded by a tab bar.
- "Phone" is the app's own breakpoint: both frames end in `md:hidden`.

Measured at 360 × 740 in Chromium, skeleton against the loaded app, with the status request held back: Inbox, Today, Upcoming (dark), with a touch screen and with a mouse, and with 59 px and 34 px insets. In each case the bar, the menu button's box, the tab bar and each of the four tabs had identical boxes (for example touch Inbox: bar `0,0,360,49`, menu box `8,4,52,48`, tab bar `0,695,360,740`; with insets: bar `0,0,360,104`, tab bar `0,661,360,740`), and the hairline and background colours matched.

### Data model, size

No op field, no table, no route, no bridge method. Android: about 150 lines and two small resources, no dependency. iOS: one colour set.

Web first load, gzip, against the same commit without the change: entry chunk 149,288 → 149,504 bytes (+216), entry and static imports 720,083 → 720,029. The entry budget is 146 KB (149,504 bytes): this change lands exactly on it. The budget file is not touched here; the next change that adds a byte to the entry chunk needs it raised on purpose.

### Interface budget

The skeleton adds no row of chrome that the shell does not already have: it shows the shell's one phone bar and the tab bar earlier. No task property, sidebar destination, scroll region or shortcut is added.

## Risks / Trade-offs

- **Not compiled here.** CI is the first compiler for the Kotlin and Swift. The `android` job must prove the build, lint, `LaunchHoldTest` and the instrumented tests (all of them now load their page in a hidden web view; `theWebViewShowsOnceThePageHasLoaded` fails if only the cap reveals it). The `ios` job must prove the build and `LaunchScreenTests` (the bundle's launch colour, the hidden web view, the status bar icons).
- **The visual-state callback while the first frame is held back** (Android 12 and later) is documented for an invisible web view, not for a held frame. If it does not fire there, the 500 ms fallback shows the page half a second after it loaded: late, never stuck.
- **An adaptive icon in a window background** (before Android 12) is an ordinary drawable from API 26, the minimum. If a device draws it wrong, the fallback is a plain shape with the foreground vector.
- **Device checks remain**: the handover has to be seen on a phone, in both appearances.

## Open Questions

- **The tab bar is 45 px tall on touch screens, not 57.** The global rule `:where(button) { min-height: 44px }` under `(pointer: coarse)` is unlayered and beats the tabs' `min-h-14`, while the shell reserves 56 px (`TAB_BAR_HEIGHT_REM`) and the spec asks for tabs of at least 48 px. The skeleton follows the real bar either way; fixing the bar is outside this change.
- **The demo banner** takes a row above the shell, so on a demo server the skeleton's bar sits one row higher than the shell's. The skeleton cannot know it is a demo before the status request answers.

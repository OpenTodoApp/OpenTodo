# Spec Delta

## ADDED Requirements

### Requirement: Text size per device
Settings → Appearance SHALL offer **Text size** with Default, Large, Larger and Largest. It SHALL scale all of the app's type, and the spacing sized with it, by setting the root font size (Large 112.5 %, Larger 125 %, Largest 150 %), so rows, sheets, the editor and the calendar reflow and wrap rather than being zoomed. Default SHALL be the device's own text size: in the iPhone app the Dynamic Type size, in the Android app the system font scale, each clamped to 85–200 %, and in a browser the browser's text size. The choice SHALL be kept on this device only, never synced, exported or cleared at sign-out, applied before the first frame is drawn, and kept separate from the theme's list text size. It SHALL work offline and write no op, so there is nothing to converge. On a touch screen fields SHALL stay at least 16 px and grow with the text size. At Largest at 360 px task rows, sheets and the tab bar SHALL keep their controls inside the viewport without overlap.

#### Scenario: Larger text on a phone
- **WHEN** a person picks Largest on their phone
- **THEN** task text, headings and buttons are 1.5 times as large at once, long titles wrap, and their laptop keeps its size

#### Scenario: The iPhone follows Dynamic Type
- **WHEN** the text size is Default in the iPhone app and the person raises Dynamic Type in iOS Settings
- **THEN** the app's text grows when it is shown again, without a reload

#### Scenario: An explicit step overrides the phone
- **WHEN** the Android system font scale is 130 % and the person picks Large
- **THEN** the app uses 112.5 %

#### Scenario: No flash on start
- **WHEN** a person with Larger reopens the app
- **THEN** the first frame drawn is already at Larger

#### Scenario: Offline and unknown values
- **WHEN** the device is offline, or holds a text size value it does not know
- **THEN** a change applies at once without an op, and an unknown value reads as Default

import XCTest

/// The first run, end to end in the real app: what a person sees when the address is
/// wrong, and that a public http address is refused with the https suggestion the
/// spec asks for (native-shells "First-run server screen"). Both cases are decided on
/// the device, so the test needs no server.
final class FirstRunTests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    /// Kept in the result bundle: a reviewer can see the screen without a Mac.
    private func attach(_ name: String) {
        let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }

    private func launch() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-OPENTODO_RESET"]
        app.launch()
        return app
    }

    func testAPublicHttpAddressIsRefusedWithTheHttpsSuggestion() {
        let app = launch()
        let field = app.textFields.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 10), "the first-run screen shows an address field")
        attach("first-run")
        field.tap()
        field.typeText("http://todo.example.com")
        app.buttons["Connect"].tap()
        XCTAssertTrue(app.staticTexts["This server must be reached over https."].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Use https://todo.example.com"].exists, "the suggestion is offered as a button")
        attach("first-run-https-refused")
    }

    func testAnUnusableAddressSaysSo() {
        let app = launch()
        let field = app.textFields.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        field.tap()
        field.typeText("not an address")
        XCTAssertFalse(app.buttons["Connect"].isEnabled, "Connect is inactive while the address is not well-formed")
        field.typeText("\n")
        XCTAssertTrue(app.staticTexts["That is not a usable address."].waitForExistence(timeout: 5))
        attach("first-run-unusable-address")
    }

    /// ios-setup-address (#1137): Connect is inactive on the empty screen and active, for VoiceOver
    /// too, as soon as the address is well-formed.
    func testConnectIsActiveOnceTheAddressIsWellFormed() {
        let app = launch()
        let field = app.textFields.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        let connect = app.buttons["Connect"]
        XCTAssertFalse(connect.isEnabled, "nothing typed yet")
        field.tap()
        field.typeText("todo")
        XCTAssertTrue(connect.isEnabled, "a host name is enough")
        field.typeText(" x")
        XCTAssertFalse(connect.isEnabled, "a space makes the address unusable")
        attach("first-run-connect-inactive")
        field.typeText(XCUIKeyboardKey.delete.rawValue + XCUIKeyboardKey.delete.rawValue + ".example.com")
        XCTAssertTrue(connect.isEnabled)
        attach("first-run-connect-active")
    }

    /// ios-setup-address (#1136): an address typed without a scheme shows the https:// it is reached
    /// over before the check starts. `todo.example.invalid` never resolves, so no server is needed.
    func testAnAddressWithoutASchemeShowsHttps() {
        let app = launch()
        let field = app.textFields.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        field.tap()
        field.typeText("Todo.Example.invalid\n")
        XCTAssertTrue(app.staticTexts["No answer from that address. Check the address and your connection."].waitForExistence(timeout: 30))
        XCTAssertEqual(field.value as? String, "https://todo.example.invalid")
        attach("first-run-https-shown")
    }

    /// ios-setup-address (#1136): plain http, typed on purpose to a local address, says it is not encrypted.
    func testPlainHttpToALocalAddressWarns() {
        let app = launch()
        let field = app.textFields.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        field.tap()
        field.typeText("192.168.1.20:8080")
        XCTAssertFalse(app.staticTexts["This connection is not encrypted."].exists, "without a scheme the address is https")
        field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 17) + "http://192.168.1.20:8080")
        XCTAssertTrue(app.staticTexts["This connection is not encrypted."].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Connect"].isEnabled, "a local http address is accepted after the warning")
        attach("first-run-http-warning")
    }

    /// The system's accessibility audit on the first-run screen (OpenSpec accessibility "Native
    /// shell accessibility checks", change accessibility-aa D6): labels, contrast, hit regions,
    /// Dynamic Type and traits, as Xcode's Accessibility Inspector checks them. The shell's
    /// other native screens (settings, the widget configuration) need a connected server;
    /// the manual VoiceOver pass in docs/accessibility/ covers them.
    func testTheFirstRunScreenPassesTheAccessibilityAudit() throws {
        guard #available(iOS 17.0, *) else { throw XCTSkip("performAccessibilityAudit needs iOS 17") }
        let app = launch()
        let field = app.textFields.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        // With a well-formed address typed and submitted with Return, as the screen is used: Connect
        // is active (on the empty screen it is inactive, and an inactive control's text is exempt
        // from the contrast minimum, WCAG 1.4.3), the error line and the https offer show, and the
        // keyboard is down (with it up the audit ran out of time in CI).
        field.tap()
        field.typeText("http://todo.example.com\n")
        XCTAssertTrue(app.staticTexts["This server must be reached over https."].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Connect"].isEnabled)
        attach("first-run-accessibility-audit")
        // Every issue is collected and printed with its element, so one CI run lists them all
        // (the class stops at the first failure). One kind is set aside, with its reason: the audit
        // reads a text's or the address field's frame at the default text size and warns it "may be
        // clipped" at larger Dynamic Type sizes, but the rows of a SwiftUI Form size themselves to
        // their content and grow with the text size; the manual VoiceOver pass at large text
        // (docs/accessibility/audit-1.0.0.md) checks it on a device.
        var found: [String] = []
        try app.performAccessibilityAudit { issue in
            let line = "\(issue.auditType) · \(issue.compactDescription) · \(issue.detailedDescription) · \(issue.element?.debugDescription ?? "no element")"
            print("accessibility audit: \(line)")
            if issue.auditType == .textClipped, let type = issue.element?.elementType, type == .textField || type == .staticText { return true }
            found.append(line)
            return true
        }
        XCTAssertTrue(found.isEmpty, "accessibility audit issues:\n" + found.joined(separator: "\n"))
    }
}

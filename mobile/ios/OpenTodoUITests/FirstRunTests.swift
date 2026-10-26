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
        app.buttons["Connect"].tap()
        XCTAssertTrue(app.staticTexts["That is not a usable address."].waitForExistence(timeout: 5))
        attach("first-run-unusable-address")
    }
}

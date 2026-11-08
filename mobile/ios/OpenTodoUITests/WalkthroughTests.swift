import XCTest

/// The walkthrough (docs/ios-app.md "Walkthrough"): the real app against a real server,
/// through first run, sign-in, the lists, a project, a task, quick add with the keyboard,
/// completing, swiping, dragging, search, the calendar and Settings. Each step leaves a
/// named screenshot in the result bundle and runs the system's accessibility audit; what
/// the audit finds and every step that could not be reached are printed as
/// `walkthrough audit:` and `walkthrough note:` lines. It reports and never fails:
/// scripts/ios-walkthrough.sh starts the server, seeds it and turns the result into PNGs.
/// Without OPENTODO_WALKTHROUGH_URL (as in `make ios`) it is skipped.
final class WalkthroughTests: XCTestCase {
    private var app: XCUIApplication!
    private var count = 0
    private var current = "start"

    override func setUp() {
        super.setUp()
        continueAfterFailure = true
    }

    func testWalkthrough() throws {
        let env = ProcessInfo.processInfo.environment
        guard let server = env["OPENTODO_WALKTHROUGH_URL"] else { throw XCTSkip("needs OPENTODO_WALKTHROUGH_URL (scripts/ios-walkthrough.sh)") }
        let email = env["OPENTODO_WALKTHROUGH_EMAIL"] ?? "ada@example.com"
        let password = env["OPENTODO_WALKTHROUGH_PASSWORD"] ?? "correct horse battery staple"
        // System prompts (notifications, saving the password) are answered so the walk goes on.
        addUIInterruptionMonitor(withDescription: "system prompt") { alert in
            for name in ["Not Now", "Don’t Allow", "Don't Allow", "Allow", "OK"] where alert.buttons[name].exists {
                alert.buttons[name].tap()
                return true
            }
            return false
        }
        app = XCUIApplication()
        app.launchArguments = ["-OPENTODO_RESET"]
        app.launch()

        // First run: the native address screen, then the web app's sign-in.
        let address = app.textFields.firstMatch
        guard address.waitForExistence(timeout: 20) else { return note("no address field") }
        step("first-run")
        address.tap()
        address.typeText(server)
        step("first-run-keyboard", audit: false)
        app.buttons["Connect"].tap()

        let web = app.webViews.firstMatch
        let emailField = web.textFields.firstMatch
        guard emailField.waitForExistence(timeout: 40) else { step("connect-failed"); return note("no sign-in form") }
        step("sign-in")
        emailField.tap()
        emailField.typeText(email)
        let passwordField = web.secureTextFields.firstMatch
        passwordField.tap()
        passwordField.typeText(password)
        step("sign-in-keyboard", audit: false)
        tap("Sign in")

        guard web.buttons["Today"].waitForExistence(timeout: 40) else { step("sign-in-failed"); return note("no tab bar after signing in") }
        if web.buttons["Skip all"].waitForExistence(timeout: 8) {
            step("start-guide")
            tap("Skip all")
        }

        // The lists, the drawer, a project and a task.
        tap("Inbox"); step("inbox")
        tap("Today"); step("today")
        tap("Upcoming"); step("upcoming")
        tap("Open menu"); step("menu")
        tap("Home renovation", prefix: true); step("project")
        tap("Get three quotes for the kitchen", prefix: true); step("task")
        web.swipeUp(); step("task-scrolled")
        tap("Back to the list"); step("task-back")

        // Quick add with the keyboard.
        tap("Today")
        if tap("Add a task") {
            step("quick-add", audit: false)
            app.typeText("Call Sam about the tiles tomorrow at 4pm #Home p2")
            step("quick-add-typed", audit: false)
            app.typeText("\n")
            step("quick-add-added", audit: false)
            dismiss()
        }

        // Completing, swiping and dragging rows on Today.
        tap("Today")
        tap("Complete Pay the electricity bill"); step("completed")
        if let row = find("Water the plants", prefix: true) { row.swipeRight(); step("swipe-right") } else { note("no row Water the plants") }
        if let row = find("Book the movers", prefix: true) { row.swipeLeft(); step("swipe-left") ; dismiss() } else { note("no row Book the movers") }
        if let from = find("Renew passport", prefix: true), let to = find("Get three quotes for the kitchen", prefix: true) {
            from.press(forDuration: 0.8, thenDragTo: to)
            step("drag")
        } else { note("no rows to drag") }

        // Search, the calendar and Settings.
        tap("Today")
        if tap("Search") {
            step("search", audit: false)
            app.typeText("kitchen")
            step("search-results", audit: false)
            dismiss()
        }
        tap("Open menu")
        tap("Calendar", prefix: true); step("calendar")
        tap("Open menu")
        tap("Ada", prefix: true); step("account-menu")
        tap("Settings"); step("settings")
        web.swipeUp(); step("settings-scrolled")
    }

    // MARK: - Steps

    /// A numbered screenshot kept in the result bundle, then the audit (not with the
    /// keyboard up: there it runs out of time, as FirstRunTests found).
    private func step(_ name: String, audit: Bool = true) {
        count += 1
        current = String(format: "%02d-%@", count, name)
        Thread.sleep(forTimeInterval: 1.5)
        let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        shot.name = current
        shot.lifetime = .keepAlways
        add(shot)
        if audit { self.audit() }
    }

    private func audit() {
        guard #available(iOS 17.0, *) else { return }
        do {
            try app.performAccessibilityAudit { issue in
                // A toast can vanish between the audit and this line; reading a gone element's
                // label fails the test, so check that it still exists first.
                let element = issue.element.flatMap { $0.exists ? "\"\($0.label)\" at \($0.frame)" : nil } ?? "no element"
                print("walkthrough audit: \(self.current) · \(Self.kind(issue.auditType)) · \(issue.compactDescription) · \(element)")
                return true
            }
        } catch {
            print("walkthrough audit: \(current) · the audit did not finish · \(error.localizedDescription)")
        }
    }

    @available(iOS 17.0, *)
    private static func kind(_ type: XCUIAccessibilityAuditType) -> String {
        let names: [(XCUIAccessibilityAuditType, String)] = [
            (.contrast, "contrast"), (.elementDetection, "element detection"), (.hitRegion, "hit region"),
            (.sufficientElementDescription, "description"), (.dynamicType, "dynamic type"),
            (.textClipped, "text clipped"), (.trait, "trait"),
        ]
        let found = names.filter { type.contains($0.0) }.map(\.1)
        return found.isEmpty ? "other" : found.joined(separator: ", ")
    }

    private func note(_ message: String) {
        print("walkthrough note: after \(current) · \(message)")
    }

    // MARK: - The web app's elements, by their accessible names

    /// The first hittable button, link or other element with this name.
    private func find(_ label: String, prefix: Bool = false) -> XCUIElement? {
        let web = app.webViews.firstMatch
        let predicate = NSPredicate(format: prefix ? "label BEGINSWITH %@" : "label == %@", label)
        for query in [web.buttons, web.links, web.descendants(matching: .any)] {
            if let element = query.matching(predicate).allElementsBoundByIndex.first(where: { $0.isHittable }) { return element }
        }
        return nil
    }

    @discardableResult
    private func tap(_ label: String, prefix: Bool = false, timeout: TimeInterval = 8) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        repeat {
            if let element = find(label, prefix: prefix) {
                element.tap()
                return true
            }
            Thread.sleep(forTimeInterval: 0.5)
        } while Date() < deadline
        note("nothing to tap named \"\(label)\"")
        return false
    }

    /// Closes a sheet or dialog the way a person would: Close if it has one, else a tap above it.
    private func dismiss() {
        if let close = find("Close") { close.tap() } else {
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.12)).tap()
        }
        Thread.sleep(forTimeInterval: 0.8)
    }
}

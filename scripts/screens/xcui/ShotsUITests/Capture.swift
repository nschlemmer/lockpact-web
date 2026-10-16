import XCTest

/// Drives Settings (iOS 27 Simulator). For every step it saves a raw PNG of the screen *before* the tap,
/// plus a sidecar JSON with the frame (in points; the Simulator is 3x) of the element about to be tapped,
/// so `annotate.py` can highlight exactly what to tap. Final-state shots have no frame.
///
/// Run: xcodebuild -project LPShots.xcodeproj -scheme LPShots -destination "id=<udid>" test
/// (output dir: $TEST_RUNNER_SHOTS_OUT or /tmp/lp-shots)
final class Capture: XCTestCase {
    let out = ProcessInfo.processInfo.environment["SHOTS_OUT"] ?? "/tmp/lp-shots"
    var settings: XCUIApplication!

    override func setUp() {
        continueAfterFailure = true
        try? FileManager.default.createDirectory(atPath: out, withIntermediateDirectories: true)
        settings = XCUIApplication(bundleIdentifier: "com.apple.Preferences")
        settings.launch()
        sleep(3)
    }

    // MARK: helpers

    func write(_ name: String, frame: CGRect?) {
        sleep(1)
        let data = XCUIScreen.main.screenshot().pngRepresentation
        try? data.write(to: URL(fileURLWithPath: "\(out)/\(name).png"))
        if let f = frame {
            let json = "{\"x\":\(f.origin.x),\"y\":\(f.origin.y),\"w\":\(f.size.width),\"h\":\(f.size.height)}"
            try? json.write(toFile: "\(out)/\(name).json", atomically: true, encoding: .utf8)
        }
    }

    func find(_ label: String) -> XCUIElement {
        let exact = settings.descendants(matching: .any).matching(NSPredicate(format: "label == %@", label)).firstMatch
        if exact.exists { return exact }
        return settings.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH %@", label)).firstMatch
    }

    /// Scrolls the label into view, screenshots the screen with the element's frame, then taps it.
    @discardableResult
    func step(_ name: String?, _ label: String, scroll: Bool = true) -> Bool {
        var q = find(label); var tries = 0
        while !q.exists && tries < 8 { if scroll { settings.swipeUp() }; sleep(1); q = find(label); tries += 1 }
        guard q.waitForExistence(timeout: 8) else { return false }
        if let n = name { write(n, frame: q.frame) }
        q.tap(); sleep(2); return true
    }

    func back() { settings.navigationBars.buttons.firstMatch.tap(); sleep(2) }

    func resetToRoot() {
        for _ in 0..<6 {
            let bar = settings.navigationBars.firstMatch
            if bar.exists && bar.identifier == "Settings" { break }
            let b = settings.navigationBars.buttons.firstMatch
            if b.exists && b.isHittable { b.tap(); sleep(1) } else { break }
        }
    }

    // MARK: flows (each starts from the Settings root)

    func testRoot() {
        resetToRoot()
        step("01-open-screen-time", "Screen Time")
        write("02-screen-time", frame: nil)
    }

    func testWebsites() {
        resetToRoot(); step(nil, "Screen Time")
        step("10-open-apps-websites", "Apps & Websites", scroll: false)
        write("11-apps-websites", frame: nil)
        step("12-open-blocked-tab", "Blocked", scroll: false)
        let add = settings.buttons.matching(NSPredicate(format: "label CONTAINS 'Add'")).firstMatch
        if add.exists { write("13-tap-add", frame: add.frame); add.tap(); sleep(2); write("14-add-website-sheet", frame: nil) }
    }

    func testRestrictions() {
        resetToRoot(); step(nil, "Screen Time"); step(nil, "Apps & Websites", scroll: false)
        step("15-open-restrictions", "Restrictions", scroll: false)
        write("16-restrictions", frame: nil)
    }

    func testSchedule() {
        resetToRoot(); step(nil, "Screen Time")
        step("20-open-schedule", "Screen Time Schedule", scroll: false)
        write("21-schedule", frame: nil)
    }

    func testTimeAllowances() {
        resetToRoot(); step(nil, "Screen Time")
        step("22-open-time-allowances", "Time Allowances", scroll: false)
        write("23-time-allowances", frame: nil)
    }

    func testAlwaysAllowed() {
        resetToRoot(); step(nil, "Screen Time")
        step("24-open-always-allowed", "Always Allowed", scroll: false)
        write("25-always-allowed", frame: nil)
    }

    func testContentPrivacy() {
        resetToRoot(); step(nil, "Screen Time")
        step("26-open-content-privacy", "Content & Privacy Restrictions")
        write("27-content-privacy", frame: nil)
    }

    func testPasscode() {
        resetToRoot(); step(nil, "Screen Time")
        step("30-open-manage", "Manage Screen Time")
        write("31-manage-screen-time", frame: nil)
        step("32-open-lock-settings", "Lock Screen Time Settings", scroll: false)
        write("33-passcode-entry", frame: nil)
    }

    func testColorFilters() {
        resetToRoot()
        step("40-open-accessibility", "Accessibility")
        step("41-open-display-text", "Display & Text Size")
        step("42-open-color-filters", "Color Filters")
        write("43-color-filters", frame: nil)
    }

    /// Diagnostic: where does Color Filters live on this iOS? Dumps all labels on Display & Text Size and Accessibility.
    func testWhereIsColorFilters() {
        resetToRoot()
        step(nil, "Accessibility")
        var all = Set<String>()
        for _ in 0..<10 { for e in settings.staticTexts.allElementsBoundByIndex { all.insert(e.label) }; settings.swipeUp() }
        try? all.sorted().joined(separator: "\n").write(toFile: "\(out)/diag-accessibility.txt", atomically: true, encoding: .utf8)
        step(nil, "Display & Text Size")
        var all2 = Set<String>()
        for _ in 0..<10 { for e in settings.staticTexts.allElementsBoundByIndex { all2.insert(e.label) }; settings.swipeUp() }
        try? all2.sorted().joined(separator: "\n").write(toFile: "\(out)/diag-display-text.txt", atomically: true, encoding: .utf8)
    }

    /// Fresh-device flow: sets a throwaway passcode (skipping recovery), records where "Change Screen Time
    /// Passcode" appears (Screen Time root vs Manage Screen Time), and captures that path.
    func labels() -> String {
        settings.staticTexts.allElementsBoundByIndex.map { $0.label }.joined(separator: " | ")
    }

    func testPasscodeFresh() {
        resetToRoot()
        step("80-open-screen-time", "Screen Time")
        step(nil, "Manage Screen Time")
        step("81-open-lock-settings", "Lock Screen Time Settings", scroll: false); sleep(1)
        settings.typeText("1234"); sleep(2)
        write("82-reenter", frame: nil)
        settings.typeText("1234"); sleep(3)
        write("83-recovery-sheet", frame: nil)
        if settings.buttons["Continue"].exists { settings.buttons["Continue"].tap(); sleep(1) }   // keyboard-tips card
        // Closing the Passcode Recovery sheet raises the "Are you sure?" prompt (Skip / Provide Apple Account).
        let close = settings.buttons.matching(NSPredicate(format: "label IN {'Close','Cancel','Dismiss'}")).firstMatch
        if close.exists { close.tap() } else { settings.coordinate(withNormalizedOffset: CGVector(dx: 0.095, dy: 0.14)).tap() }
        sleep(2)
        write("83b-skip-prompt", frame: nil)
        let skip = settings.descendants(matching: .any).matching(NSPredicate(format: "label == 'Skip'")).firstMatch
        if skip.waitForExistence(timeout: 5) { write("84-skip-highlight", frame: skip.frame); skip.tap() }
        else { settings.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.556)).tap() }
        sleep(3)
        write("85-after-skip", frame: nil)
        let inManage = find("Change Screen Time Passcode").exists
        try? "after set, on Manage Screen Time: \(labels())".write(toFile: "\(out)/diag-manage.txt", atomically: true, encoding: .utf8)
        write("86-manage-after-set", frame: nil)
        if inManage {
            if step("90-open-change-passcode", "Change Screen Time Passcode", scroll: false) {
                write("91-change-options", frame: nil)
                if step("92-open-change-again", "Change Screen Time Passcode", scroll: false) { write("93-enter-current", frame: nil) }
            }
        }
        resetToRoot(); step(nil, "Screen Time"); sleep(1)
        var atRoot = find("Change Screen Time Passcode").exists
        if !atRoot { for _ in 0..<4 { settings.swipeUp(); sleep(1); if find("Change Screen Time Passcode").exists { atRoot = true; break } } }
        try? "inManage=\(inManage) atRoot=\(atRoot)\nroot labels: \(labels())".write(toFile: "\(out)/diag-root.txt", atomically: true, encoding: .utf8)
        write("87-screen-time-after-set", frame: nil)
        if atRoot {
            if step("90-open-change-passcode", "Change Screen Time Passcode", scroll: false) {
                write("91-change-options", frame: nil)
                if step("92-open-change-again", "Change Screen Time Passcode", scroll: false) { write("93-enter-current", frame: nil) }
            }
        }
    }

    /// Home Screen long-press menu ("Require Face ID"). Needs Face ID enrolled in the Simulator.
    func testFaceIDMenu() {
        let sb = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        sb.activate(); sleep(2)
        XCUIDevice.shared.press(.home); sleep(2)
        write("70-home-screen", frame: nil)
        let icon = sb.icons["Calendar"].firstMatch
        if icon.waitForExistence(timeout: 5) {
            icon.press(forDuration: 1.5); sleep(2)
            let req = sb.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Require'")).firstMatch
            write("71-quick-actions", frame: req.exists ? req.frame : nil)
            try? sb.debugDescription.write(toFile: "\(out)/diag-springboard.txt", atomically: true, encoding: .utf8)
        }
    }

    // MARK: paced flows for screen recordings. Each writes "<startEpoch> <endEpoch>" to $out/video-<name>.txt
    // so the shell can trim the recording to exactly the flow.

    func timed(_ name: String, _ flow: () -> Void) {
        let t0 = Date().timeIntervalSince1970
        flow()
        let t1 = Date().timeIntervalSince1970
        try? "\(t0) \(t1)".write(toFile: "\(out)/video-\(name).txt", atomically: true, encoding: .utf8)
    }

    func testVideoWebsites() {
        resetToRoot()
        timed("websites") {
            sleep(2); step(nil, "Screen Time"); sleep(2)
            step(nil, "Apps & Websites", scroll: false); sleep(2)
            step(nil, "Blocked", scroll: false); sleep(2)
            let add = settings.buttons.matching(NSPredicate(format: "label CONTAINS 'Add'")).firstMatch
            if add.exists { add.tap(); sleep(2)
                let f = settings.textFields.firstMatch; if f.waitForExistence(timeout: 4) { f.tap(); sleep(1); settings.typeText("example.com") }
                sleep(3) }
        }
    }

    func testVideoPasscode() {
        resetToRoot()
        timed("passcode") {
            sleep(2); step(nil, "Screen Time"); sleep(2)
            step(nil, "Manage Screen Time"); sleep(2)
            step(nil, "Lock Screen Time Settings", scroll: false); sleep(2)
            settings.typeText("1234"); sleep(3)
            let x = settings.buttons.matching(NSPredicate(format: "label IN {'Close','Cancel','Dismiss'}")).firstMatch
            if x.exists { x.tap() } else { settings.coordinate(withNormalizedOffset: CGVector(dx: 0.095, dy: 0.115)).tap() }
            sleep(2)
        }
    }

    func testVideoTour() {
        resetToRoot()
        timed("tour") {
            sleep(2); step(nil, "Screen Time"); sleep(2)
            step(nil, "Time Allowances", scroll: false); sleep(3); back(); sleep(1)
            step(nil, "Screen Time Schedule", scroll: false); sleep(3); back(); sleep(1)
            step(nil, "Always Allowed", scroll: false); sleep(3); back(); sleep(1)
            step(nil, "Apps & Websites", scroll: false); sleep(3); back(); sleep(1)
        }
    }

    /// Runs after testPasscodeFresh (passcode "1234" is set): captures the Change / Turn Off screens.
    func testChangeFlow() {
        resetToRoot(); step(nil, "Screen Time")
        step(nil, "Manage Screen Time"); sleep(1)
        step("90-open-change-passcode", "Change Screen Time Passcode", scroll: false); sleep(2)
        write("91-change-options", frame: nil)
        let turnOff = settings.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH 'Turn Off Screen Time Passcode'")).firstMatch
        if turnOff.waitForExistence(timeout: 4) { write("92-turn-off-highlight", frame: turnOff.frame) }
        let change = settings.descendants(matching: .any).matching(NSPredicate(format: "label == 'Change Screen Time Passcode'")).element(boundBy: 1)
        if change.exists { write("93-change-again-highlight", frame: change.frame); change.tap(); sleep(2); write("94-enter-current", frame: nil) }
        try? labels().write(toFile: "\(out)/diag-change.txt", atomically: true, encoding: .utf8)
    }
}

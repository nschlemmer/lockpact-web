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

    /// Sets a throwaway passcode (skipping recovery), captures where Change / Turn Off live, then removes it.
    func testPasscodeLifecycle() {
        // Clear any leftover sheet from a previous run.
        for _ in 0..<2 { let x = settings.buttons.matching(NSPredicate(format: "label IN {'Close','Cancel','Dismiss'}")).firstMatch; if x.exists { x.tap(); sleep(1) } }
        resetToRoot(); step(nil, "Screen Time")
        step(nil, "Manage Screen Time")
        if find("Change Screen Time Passcode").exists { write("60-already-set", frame: nil) }
        else {
            step(nil, "Lock Screen Time Settings", scroll: false); sleep(1)
            settings.typeText("1234"); sleep(2)
            settings.typeText("1234"); sleep(3)
            write("61-skip-dialog", frame: nil)
            let skip = settings.buttons["Skip"]
            if skip.waitForExistence(timeout: 5) { write("62-skip-highlight", frame: skip.frame); skip.tap(); sleep(3) }
        }
        write("63-manage-after-set", frame: nil)
        resetToRoot(); step(nil, "Screen Time")
        write("64-screen-time-after-set", frame: nil)
        for _ in 0..<3 { settings.swipeUp() }
        write("65-screen-time-after-set-bottom", frame: nil)
        if step("66-open-change-passcode", "Change Screen Time Passcode") {
            write("67-change-passcode-options", frame: nil)
            if step("68-open-turn-off", "Turn Off Screen Time Passcode", scroll: false) { sleep(1); settings.typeText("1234"); sleep(3); write("69-after-turn-off", frame: nil) }
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
}

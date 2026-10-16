import XCTest

final class SafariTests: XCTestCase {
    let out = ProcessInfo.processInfo.environment["SAFARI_OUT"] ?? "/tmp/lp-safari"
    var app: XCUIApplication!
    var log = ""

    override func setUp() {
        continueAfterFailure = true
        try? FileManager.default.createDirectory(atPath: out, withIntermediateDirectories: true)
        app = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
        app.activate()
        sleep(4)
    }
    override func tearDown() {
        try? log.write(toFile: "\(out)/\(name.replacingOccurrences(of: " ", with: "_").replacingOccurrences(of: "[", with: "").replacingOccurrences(of: "]", with: "")).log", atomically: true, encoding: .utf8)
    }

    func shot(_ n: String) { sleep(1); try? XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: "\(out)/\(n).png")) }
    func say(_ s: String) { log += s + "\n"; print("RESULT: " + s) }
    func web() -> XCUIElement { app.webViews.firstMatch }
    func text(_ s: String) -> Bool { web().staticTexts.matching(NSPredicate(format: "label CONTAINS %@", s)).firstMatch.exists }
    func btn(_ s: String) -> XCUIElement { web().buttons.matching(NSPredicate(format: "label CONTAINS %@", s)).firstMatch }
    func img(_ s: String) -> XCUIElement { web().images.matching(NSPredicate(format: "label CONTAINS %@", s)).firstMatch }

    /// Scrolls the page until the element's frame sits between the nav bar and the Safari toolbar.
    func bring(_ el: XCUIElement, top: CGFloat = 270, bottom: CGFloat = 640) {
        for _ in 0..<40 {
            guard el.exists else { web().swipeUp(velocity: .default); continue }
            let f = el.frame
            if f.minY >= top && f.minY <= bottom { return }
            if f.minY > bottom { web().swipeUp(velocity: .slow) } else { web().swipeDown(velocity: .slow) }
        }
        say("WARNING: could not bring element into view")
    }

    func dragStrip(from y: CGFloat) {
        let o = app.coordinate(withNormalizedOffset: .zero)
        let w = app.frame.width
        o.withOffset(CGVector(dx: w * 0.85, dy: y)).press(forDuration: 0.1, thenDragTo: o.withOffset(CGVector(dx: w * 0.1, dy: y)))
        sleep(2)
    }

    func watchFlow(_ prefix: String, phone: Bool) {
        let title = web().staticTexts["Block a website in Screen Time"].firstMatch
        bring(title, top: 300, bottom: 520)
        let w = web().descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH %@", "Watch")).firstMatch
        say("Watch pill in a11y tree: \(w.exists) (type \(w.exists ? String(w.elementType.rawValue) : "-"))")
        shot("\(prefix)-5b-before-watch")
        if w.exists && w.isHittable { w.tap() } else if phone {
            let o = app.coordinate(withNormalizedOffset: .zero)
            o.withOffset(CGVector(dx: 82, dy: title.frame.midY + 39)).tap()
            say("tapped Watch by coordinate (a11y query did not find it)")
        }
        sleep(3)
        say("after Watch: counter reads exactly 'Video': \(web().staticTexts["Video"].exists)")
        shot("\(prefix)-6-watch")
        sleep(4)
        shot("\(prefix)-7-watch-4s-later")
    }

    func testPhone() {
        shot("iphone-0-top")
        let first = img("Screen Time row highlighted in the Settings list")
        bring(first, top: 330, bottom: 460)
        shot("iphone-1-guide")
        say("counter 'Step 1 of 5': \(text("Step 1 of 5"))")
        say("strip image frame: \(first.frame)")
        let y = first.frame.minY + 150
        dragStrip(from: y)
        say("after one swipe left: counter 'Step 2 of 5': \(text("Step 2 of 5"))")
        shot("iphone-2-after-swipe")
        dragStrip(from: y)
        say("after second swipe: 'Step 3 of 5': \(text("Step 3 of 5"))")
        shot("iphone-3-after-swipe2")
        let s5 = btn("Type the address")
        bring(s5, top: 300, bottom: 620)
        s5.tap(); sleep(2)
        say("tapped step 5: counter 'Step 5 of 5': \(text("Step 5 of 5"))")
        let s1 = btn("Open Settings, then tap Screen Time")
        bring(s1, top: 300, bottom: 620)
        shot("iphone-4-before-tap-step1")
        let up = img("Screen Time row highlighted")
        say("strip after step-5 tap, image 1 hittable (should be scrolled away): \(up.isHittable)")
        s1.tap(); sleep(2)
        say("tapped step 1: counter 'Step 1 of 5': \(text("Step 1 of 5"))")
        bring(first, top: 330, bottom: 460)
        shot("iphone-5-strip-back-at-1")
    }

    func testPhoneWatch() { watchFlow("iphone", phone: true) }

    func testTablet() {
        shot("ipad-0-top")
        let h = web().staticTexts["Block a website in Screen Time"].firstMatch
        bring(h, top: 150, bottom: 400)
        shot("ipad-1-guide")
        say("counter 'Step 1 of 5': \(text("Step 1 of 5"))")
        let next = btn("Next step")
        say("Back/Next present (two-column layout): \(next.exists)")
        next.tap(); sleep(1); next.tap(); sleep(1)
        say("after two Next taps: 'Step 3 of 5': \(text("Step 3 of 5"))")
        shot("ipad-2-after-next")
        btn("Type the address").tap(); sleep(1)
        say("tapped step 5: 'Step 5 of 5': \(text("Step 5 of 5"))")
        shot("ipad-3-step5")
        watchFlow("ipad", phone: false)
    }
}

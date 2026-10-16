Drives the step guide in Simulator Safari (XCUITest). Serve `dist/client` on port 4416 (a static server that supports
Range requests, or the video will not play), open the page in the Simulator, then:

    xcodegen generate
    TEST_RUNNER_SAFARI_OUT=/tmp/lp-safari xcodebuild -project LPSafari.xcodeproj -scheme LPSafari \
      -destination "id=<udid>" -only-testing:SafariUITests/SafariTests/testPhone test   # or testPhoneWatch / testTablet

Screenshots and a RESULT log land in $SAFARI_OUT.

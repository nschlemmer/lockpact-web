---
title: "Lock Screen Time Settings: Give Your Partner the Passcode"
description: "iOS 26.4 added a Screen Time passcode only your partner holds — so you can't turn off your blocker or delete it. Free setup guide, no subscription."
pubDate: 2026-09-10
author: "LockPact"
tags: ["iOS 26.4", "Screen Time", "accountability", "how-to"]
faq:
  - q: "Can I set the Screen Time passcode myself?"
    a: "You can, but it defeats the point. Lock Screen Time Settings only works if the passcode belongs to someone other than you — if you set it, you can always change or remove it yourself, same as any Screen Time passcode."
  - q: "Does Lock Screen Time Settings stop me deleting the app?"
    a: "Yes — per Opal's help documentation, once it's on, deleting a Screen Time-protected app requires the same passcode as revoking its Screen Time access. Both actions are gated together, not separately."
  - q: "What if my partner forgets the passcode?"
    a: "Forgot Passcode routes to an Apple ID-based reset if a recovery Apple ID was added during setup — which is exactly why many partners choose to skip that step. Without it, the only recovery is erasing the device."
---

Apple quietly shipped the missing half of every app blocker in iOS 26.4, and almost nobody's using it right. **Settings → Screen Time → Lock Screen Time Settings** lets you gate your Screen Time controls behind a passcode — but it only does anything if someone *other than you* holds that code. Set it yourself, and you've just made a second passcode you also know. This is a free, five-minute setup guide for doing it the way that actually works, plus the honest limits of what it stops.

## What changed in iOS 26.4

Before iOS 26.4, Screen Time's protections stopped at the app-limit level. You could set a daily limit on Instagram, but turning Screen Time off entirely — Settings → Screen Time → toggle off, or Settings → Apps → [App] → turn off Screen Time access for that one app — needed only your device's regular Screen Time passcode, which you set and you know. Three taps and any restriction was gone.

iOS 26.4 added a second, separate passcode: **Lock Screen Time Settings**. Once it's on, both of the actions above — revoking Screen Time access for a specific app, and (per Opal's help documentation) deleting that app outright — require this new code instead of your regular one. It's off by default. Nothing changes until someone turns it on and, critically, that someone shouldn't be you.

This is functionally the same thing Opal and one sec now recommend in their own help docs: have a partner set the passcode. It's Apple, not a third-party app, that closed this gap — the missing piece was just knowing it existed and doing it with the right person.

## Setting it up (for your partner to do, not you)

Hand your phone to the person who's going to hold the code — a partner, a close friend, whoever you trust not to hand it back on request. Then:

1. Open **Settings**.
2. Tap **Screen Time**.
3. Make sure **Content & Privacy Restrictions** is turned on — this matters, because the "deleting apps" part of the gate only applies once Content & Privacy Restrictions is active, not from Lock Screen Time Settings alone.
4. Scroll down and tap **Lock Screen Time Settings**.
5. Enter a passcode (your partner chooses it, not you) and confirm it.
6. You'll be asked whether to add an Apple ID as a backup recovery method. Read the loophole note below before answering — for most people, the honest answer is skip it.

That's the whole setup. No app to install, no subscription, no account to create.

## What this actually locks

Once it's on, two specific things now require your partner's passcode instead of yours:

- **Revoking Screen Time access for an app.** Settings → Apps → [App name] → the toggle that turns off Screen Time monitoring for that one app — the fastest, quietest way to disable a blocker that relies on Screen Time. Locked.
- **Deleting the app.** With Content & Privacy Restrictions on, removing a Screen Time-protected app from your phone requires the same code.

It does not lock the app limit itself from being adjusted in every case, and it doesn't touch anything outside Screen Time's reach — this is specifically about the two exits people actually use to quit quietly.

For the Instagram-specific version of this — pairing it with an actual time limit or Downtime schedule — see [how to lock Instagram after a time limit or during certain hours](/blog/instagram-vs-lockpact-blocking/), which walks through the App Limits side of this in more detail than repeating it here would add.

### Where LockPact fits

Lock Screen Time Settings answers "can I stop myself from quietly turning this off." It doesn't tell your partner anything if you do manage to get around it, and it depends entirely on your partner being the one who set it up correctly in the first place. LockPact adds the piece Apple's setting doesn't: a mutual lock your partner approves unlocking, plus a notification the moment either of you bypasses it — free, no subscription, no Premium tier.

[Get LockPact on the App Store →](/go/b-lock-screen-time-settings-partner-passcode/)

## The honest limits — four loopholes that still exist

No setting from Apple, and no app, makes an iPhone bypass-proof for its own owner. That's Hard Truth #1 of how this actually works, and pretending otherwise would be exactly the kind of overclaim this feature is supposed to fix. Here's what still gets around Lock Screen Time Settings:

**A reported, unconfirmed Face ID path.** Developer forum threads (Apple's own developer forums, thread 821959) describe the Settings → Apps → [App] Screen Time toggle prompting for Face ID instead of the Lock Screen Time Settings passcode on some builds — which, if it reproduces on your device, defeats the gate entirely. This is reported and community-discussed, not something Apple has formally confirmed as fixed or as intended behavior in every build. Treat it as a live risk to check on your own device, not a settled fact either way.

**Forgot-passcode → Apple ID reset.** If your partner added an Apple ID as backup recovery during setup, "Forgot Passcode" routes through an Apple ID-based reset. That's a real convenience if your partner genuinely forgets the code — and a real loophole if you have any path back into that Apple ID. Most people choose to skip the backup step for exactly this reason.

**Erasing the device.** Wiping the phone resets Screen Time along with everything else on it. Nobody does this by accident, but it's real, and it's the same "nuclear option" every locked system on iOS shares.

**You can always just ask.** No passcode stops a partner from saying yes. If the honest goal is behavior change, not a technical wall, this isn't really a loophole so much as the actual point — the setting raises the cost of quitting quietly from three taps to a conversation.

## What to pair this with

Lock Screen Time Settings is a one-time setting, not an app — it doesn't tell anyone if you try to get around it, and it only covers the two exits described above. If you want the full picture of what happens when someone does get past a lock, including how to handle it as a couple, [what to do when your partner bypasses the lock](/blog/what-to-do-when-partner-bypasses-lock/) covers that conversation directly. And if the goal is ranking how hard various blockers actually are to get around — this setting included — [see the honest ranking of app blockers by bypass difficulty](/blog/app-blockers-you-cant-bypass-iphone/).

If you don't currently have a specific app you're trying to lock so much as a general "I want someone else to hold the key" arrangement, [the category of apps built around exactly that](/blog/apps-that-let-a-friend-control-your-screen-time/) is a reasonable next stop.

## Frequently Asked Questions

### Can I set the Screen Time passcode myself?

You can, but it defeats the point. Lock Screen Time Settings only works if the passcode belongs to someone other than you — if you set it, you can always change or remove it yourself, same as any Screen Time passcode.

### Does Lock Screen Time Settings stop me deleting the app?

Yes — per Opal's help documentation, once it's on (and Content & Privacy Restrictions is enabled), deleting a Screen Time-protected app requires the same passcode as revoking its Screen Time access. Both actions are gated together, not separately.

### What if my partner forgets the passcode?

Forgot Passcode routes to an Apple ID-based reset if a recovery Apple ID was added during setup — which is exactly why many partners choose to skip that step. Without it, the only recovery is erasing the device.

---

Sources checked 2026-09-08: [Apple developer forums, thread 821959](https://developer.apple.com/forums/thread/821959) (Face ID path, reported and community-discussed, not formally confirmed as fixed by Apple in this thread) · [Opal's help center on making Opal foolproof](https://opalapp.com/help/how-to-lock-opals-screen-time-access) · [one sec's guide to locking Screen Time permission](https://one-sec.app/blog/lock-screen-time-permission) · [Tech Lockdown's iOS 26 Screen Time permissions writeup](https://techlockdown.com/articles/ios26-update-screen-time-protected-app-permissions) (last updated 2026-04-20; confirms Content & Privacy Restrictions must also be enabled for app-deletion gating to apply).

[LockPact](/) is a free, mutual lock — your partner holds your unlock, you hold theirs, and bypass gets reported the moment it happens. [Get it on the App Store](/go/b-lock-screen-time-settings-partner-passcode/).

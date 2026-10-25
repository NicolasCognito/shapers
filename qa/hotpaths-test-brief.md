# QA: voice mic, Requests page, hot paths (local build)

You are testing a web app. Report problems; **do not change the app's code**.

## Setup

- App: http://127.0.0.1:8090 (already running; do not restart or rebuild it).
- Playwright, phone emulation (`devices["iPhone 13"]`, `devices["Pixel 7"]`) **and** desktop 1440×900. Chromium is in `%LOCALAPPDATA%\ms-playwright`. Scripts → `qa/scripts/`, screenshots → `qa/screens/hp-*.png`.
- Accounts (password `shapers2026`): admin `ana.kovac@sandbox.example`; members `zala.turk@sandbox.example` (GO!), `nina.zupan@sandbox.example` (Impact).
- A tour starts on first sign-in; close it (×/Esc) unless you are testing it.
- A test meeting **“QA check-in test”** is open for clock-in right now; Ana, Zala and Nina are in it.
- Sandbox data: logging hours, sending/approving requests, checking in is fine.
- Jarvis costs money: **at most 3 messages** in total. The microphone cannot be really used in headless Chromium; grant the permission / use a fake media stream (`--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`) and check the UI states only.

## What to test

1. **Jarvis voice UI.** Floating button bottom-right is split: “✦ Ask Jarvis” | 🎤. Mic part opens the panel and should start recording (red pulsing button). In the panel: big round mic button right of the input when the input is empty; typing turns it into a Send arrow, with a smaller mic next to it; while Jarvis answers it becomes Stop. Language chip (🎤 AUTO) sits in the input footer. Check sizes/overlaps on phones and desktop, and that sending with Enter and with the button both work (1 message).
2. **Requests page** (`/requests`), as member and as admin:
   - Tabs To decide / Mine / History (History admin only) with counters; default tab is “To decide” when something waits.
   - “New request” → “Hours for an older date” (date 2+ days ago, hours, required note) and “Pause” (from/to, required reason). Both send and appear in Mine.
   - As admin: approve with one tap; Reject asks for a reason first (button disabled until filled), Cancel returns. If ≥2 hour requests wait, “Approve all N” appears and works.
   - History: type filter chips and name search (e.g. “nina”); “Show more” if many.
   - Layout on phones: no horizontal scroll, buttons not cramped.
3. **Meeting now bar.** On every page, under the header, a green strip for “QA check-in test”. As Zala: “I'm here” → strip shows ✓ You're in; My week updates. As Nina: “Remote”. × hides it for the session. As Ana (admin): “Roll call” opens Team with the roll-call sheet for that meeting; “QR” shows a scannable QR code.
4. **QR link.** Open the URL shown under the QR (`/checkin/<id>`) while signed out: after login it must land back on that link and show “You're in!”. Opening it again as a checked-in member shouldn't break.
5. **“+h” in the header.** Popover with Today/Yesterday and amount buttons; one tap logs, toast has Undo (check it removes the log); My week numbers update without reload. Check it fits on phones next to the other header icons.
6. Anything else broken you notice on these screens (both themes if quick).

## Report

Write `qa/hotpaths-report.md`: a table **# / area / problem / severity (high/med/low) / device / screenshot**, then a short list of what works. Keep it short and concrete.

# Hot paths QA — 2026-10-25

Live Chromium checks, approximately 08:22–08:29 Europe/Budapest: Playwright iPhone 13, Pixel 7, desktop 1440×900; Ana, Zala and Nina. No connection refusals occurred. App code was not modified; the app was not restarted or rebuilt. [Execution evidence](hotpaths-execution.log); scripts: `qa/scripts/hp_*.py`.

| # | area | problem | severity (high/med/low) | device | screenshot |
| --- | --- | --- | --- | --- | --- |
| 1 | Header quick hours | `+h` is absent from the header for members and admin. Cannot open Today/Yesterday/amount popover or test its logging, toast Undo, or live My week totals. | med | iPhone 13, Pixel 7, desktop 1440×900 | [iPhone](screens/hp-iphone-missing-quickhours.png), [Pixel](screens/hp-pixel-member-header.png), [desktop](screens/hp-desktop-admin-header.png) |
| 2 | Signed-out QR / first-login tour | In a fresh browser, open `/checkin/1ut30zh96w4jghg`, sign in: the correct link briefly shows “You're in!”, then the automatic tour navigates away to `/me` (Zala) or `/team` (Ana). Closing the tour leaves that destination, rather than the QR confirmation. Attendance is saved. | med | Pixel 7 (member), iPhone 13 (admin) | [Confirmation before redirect](screens/hp-pixel-qr-login-early.png), [tour after redirect](screens/hp-pixel-qr-login-late.png), [admin](screens/hp-iphone-qr-login-result.png) |
| 3 | Meeting bar | With admin controls visible, the meeting title shrinks to “Now…” and its time is truncated, so the meeting cannot be identified from the bar. | low | iPhone 13, Pixel 7 | [iPhone](screens/hp-iphone-admin-reject.png), [Pixel](screens/hp-pixel-admin-bar-truncated.png) |

What works:

- Jarvis split launcher; mic opens the panel recording with a red pulsing control; empty-input mic, typed-input Send plus smaller mic, answering Stop, and AUTO language menu. Enter and Send each received an “OK” response: **2 messages total**. Fake microphone stream and permission used; real speech accuracy untested. Controls fit on [iPhone](screens/hp-iphone-jarvis-confirmed.png), [Pixel](screens/hp-pixel-jarvis-clean.png), and [desktop](screens/hp-desktop-jarvis-typed.png).
- Older-hours request (23 Oct, 2 days earlier) and pause (26 Oct–1 Nov) send and appear in Mine; note/reason required. Admin older-hours submission also works. Pending counters and default To decide work; History is hidden from members. Single approval, rejection with required reason, Cancel, and confirmed “Approve all 3” work; results appear in member Mine and admin History. Name search plus hours/pause filters work. Only 8 resolved requests were available; Show more was not exercised.
- Zala’s “I'm here” changes the strip to “You're in” and My week attendance from 80% to 90% without reload. Nina’s Remote updates the strip and attendance. Hide persists across sidebar navigation. Bar appears on My week, Requests, Team and QR pages. Admin Roll call opens Team with the correct meeting sheet.
- QR image independently decodes to the displayed URL. Signed-out login reaches confirmation before the tour issue above; reopening while checked in succeeds.
- Member/admin Requests layouts have no horizontal overflow at 390px/412px; decision controls remain usable. Light/dark spot checks passed apart from listed issues.

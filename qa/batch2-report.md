# Batch 2 QA report

Tested the running local build on 25 October 2026 with Chromium: desktop 1440×900, iPhone 13 and Pixel 7 emulation. No app code changes, rebuilds or restarts. One Jarvis message sent.

| # | area | problem | severity (high/med/low) | device | screenshot |
|---|---|---|---|---|---|
| 1 | Meeting QR / Download PNG | Dialog QR and Copy link decode to `http://127.0.0.1:8090/checkin/nmd2dkwe3hchavt`; downloaded PNG from `/api/team/qr/nmd2dkwe3hchavt` decodes to `https://shapers.167-233-125-44.sslip.io/checkin/nmd2dkwe3hchavt`. The downloaded QR does not match the printed URL. | med | Desktop | [Dialog](screens/b2-qr-dialog.png), [downloaded PNG](screens/b2-qr-download.png) |
| 2 | Add member | iPhone dialog is 810px tall in a 664px viewport, positioned at y=-73. Title/close and footer extend outside the viewport. Wheel scrolling does not move it; clicking Close times out because it remains outside the viewport. | med | iPhone 13 | [Viewport](screens/b2-iphone-add-member-viewport.png), [after scrolling](screens/b2-iphone-add-member-after-scroll.png) |
| 3 | Jarvis requests answer | Correctly lists Ana's pending 0.25h request, but says “You'll decide it on the Requests page.” Ana's To decide tab is empty; her own request only offers Withdraw. | low | Desktop | [Answer](screens/b2-jarvis-requests-answer.png), [To decide](screens/b2-requests-to-decide.png), [own request](screens/b2-requests-baseline.png) |
| 4 | Settings copy | Subtitle still says “configure model providers”, although provider configuration has been removed from Settings. | low | Desktop, both phones | [Member settings](screens/b2-member-settings.png) |

What works:

- Upcoming-meeting QR dialog is scannable; decoded SVG and clipboard URL match. Download is a valid, scannable PNG. Attendance date opens roll call with QR beside the title; phone QR dialogs fit.
- Add member: tier placeholders are 4/10/70 hours, password regeneration works, Admin hides Jarvis, short passwords disable submission, duplicate emails show an error, and credentials copy correctly. Fresh-context sign-in works; the new Shapers Tech member sees Tech and Community meetings. Member `POST /api/team/members` returns 403.
- Zala initially has no Jarvis button/sidebar entry or Jarvis tour step; direct `/chat` works. Enabling access makes the controls appear after reload. Ana always has Jarvis. Vacation/Jarvis text clicks do nothing; switches work without success toasts.
- Project grid/list badges and explanatory tooltips work and fit both phones. New project starts on Members; admins are excluded from the picker. Add everyone adds all 19 non-admins. Zala-only project is visible to Zala and absent for Nina, including its deadline tasks. Project settings also offers Add everyone.
- Deadlines: search, project, everyone/me/unassigned/person, priority and Show done filters work; counts update (7 QA open tasks → 8 with done). Date/priority sorting and all seven groups checked, including This week with the browser clock fixed to Monday 19 October. Opening Deadlines from a project selects it; clicking a task opens its project board and task sheet. No horizontal page overflow on either phone; light/dark deadline views checked.
- Settings shows Language/Appearance, admin-only Organisation, and Memory only with Jarvis access; no model/MCP/key controls. Meeting hours defaults off. Present adds “Meeting: QA check-in test” (3.25h) to Zala's My week; Missed removes it.

Conditional check: no meeting had `can_check_in=true` during testing, so the realtime “I'm here” → “You're in” bar transition was not exercised.

Cleanup: Zala's Jarvis and Vacation switches are off; meeting hours is off; original Zala attendance restored; additional test-generated meeting-hour entries removed. QA member/project/tasks retained as sandbox fixtures. Scripts: `qa/scripts/b2_*.py`; screenshots: `qa/screens/b2-*.png`.

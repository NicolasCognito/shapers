# Mobile retest: fixes from qa/mobile-report.md

Same setup as `qa/mobile-test-brief.md` (app at http://127.0.0.1:8090, freshly rebuilt; same accounts; Playwright iPhone 13 and Pixel 7; do not change app code; at most 2 Jarvis messages). Clear the browser storage first so the tour starts again.

Re-check **only** issues 1–10 from `qa/mobile-report.md`:

1. Admin sees Nina's pending pause request in Requests and can approve it.
2. Logging hours for a date older than yesterday becomes a request (no HTTP 400).
3. Team → Attendance dialog: member names readable on phones.
4. Jarvis page on phones: chat readable; a “Conversations” button opens the list, “Back to chat” returns.
5. “Take the tour” from the mobile sidebar: menu closes, tour can be navigated and closed.
6. Tour steps for sidebar items on phones now highlight the ☰ menu button.
7. Timer: repeated short pauses no longer add time.
8. Team → Members: ⏸ badge appears right after setting a pause in the member detail (no reload).
9. Board project on phones: no horizontal page overflow; toolbar wraps.
10. Tap targets: DONE expander in My tasks and Team sort headers ≥ 24 px high.

Also note any **new** problem you notice on those screens.

Write `qa/retest-report.md`: a table **# / fixed? (yes / no / partly) / note / screenshot**, then new issues if any. Keep it short.

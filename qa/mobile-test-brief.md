# Mobile QA: Shapers (local build)

You are testing a web app on a **phone emulator**. Report problems; **do not change the app's code**.

## Setup

- App: http://127.0.0.1:8090 (already running locally; do not restart or rebuild it).
- Use Playwright with mobile device emulation (e.g. `devices["iPhone 13"]` and `devices["Pixel 7"]`). Chromium browsers are already in `%LOCALAPPDATA%\ms-playwright`. Put any scripts you write in `qa/scripts/` and screenshots in `qa/screens/`.
- Accounts (password `shapers2026` for all):
  - Admin: `ana.kovac@sandbox.example`
  - Member, tier GO!: `zala.turk@sandbox.example`
  - Member, tier Impact: `nina.zupan@sandbox.example`
- The login page has quick sign-in buttons too.
- Test data is a sandbox: it's fine to log hours, send requests, approve them, etc.
- Jarvis (the AI assistant) costs money per message: send **at most 5 messages in total**.

## What to test (on a phone viewport; also once on desktop 1440×900 for comparison)

1. **Interactive tour.** On first sign-in a step-by-step tour starts by itself (member route on My week, admin route on Team). Go through every step for a member and for the admin: is each highlighted element visible and the popover readable and not cut off? Do Next/Back/close work? Does it start only once (sign out / in again)? It can be replayed with “Take the tour” in the sidebar menu. The last step offers sample questions: clicking one should open the Jarvis panel and send it.
2. **Work timer (My week).** Start, Pause (clock stops, ⏸ in the header pill), Resume, Stop & log. Paused time must not be counted.
3. **Log hours** with the quick buttons and the form; an older date turns into a request.
4. **Meetings: “Can't come”** on an upcoming meeting (enter a reason in the prompt). As the GO! member, a Community meeting less than 72 h away should count as a late notice (unexcused). “I'll come” takes it back.
5. **Rules card (My week → “Rules: Community & pause”).** As Impact: ask for a pause starting today (should be refused: must be in advance), then a valid one (e.g. two weeks starting next Monday). As GO!: a pause without a reason should be refused.
6. **Admin: Requests** — approve the pause request. **Team → Members**: the member shows a ⏸ badge when the pause covers this week; open the member, set and remove a pause directly; check the “Community ⚠” badge logic looks sensible.
7. **Admin: Team → Attendance** — record attendance for one meeting.
8. **General mobile check** of every page in the sidebar (My week, My tasks, Requests, Team, My Tree, Board, Jarvis, Settings): horizontal scrolling, overlapping or cut-off elements, tap targets too small, dialogs/prompts that don't fit, text overflow, broken layout in dark mode (toggle if available).

## Report

Write `qa/mobile-report.md`:

- One line summary: overall verdict.
- A table of issues, most severe first: **#, severity (blocker / major / minor / cosmetic), page, device, steps to reproduce, expected vs actual, screenshot path**.
- A short list of things that worked well.

Be concrete and brief. Don't report the same issue twice for both devices; note “both”.

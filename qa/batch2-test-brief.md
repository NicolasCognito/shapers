# QA: meeting QR, add member, Jarvis access, project members, deadlines (local build)

You are testing a web app. Report problems; **do not change the app's code**.

## Setup

- App: http://127.0.0.1:8090 (already running; do not restart or rebuild it).
- Playwright, phone emulation (`devices["iPhone 13"]`, `devices["Pixel 7"]`) **and** desktop 1440×900. Chromium is in `%LOCALAPPDATA%\ms-playwright`. Scripts → `qa/scripts/b2_*.py`, screenshots → `qa/screens/b2-*.png`.
- Accounts (password `shapers2026`): admin `ana.kovac@sandbox.example`; members `zala.turk@sandbox.example` (GO!), `nina.zupan@sandbox.example` (Impact).
- A tour starts on first sign-in; close it (×/Esc).
- Sandbox data: creating members, projects, tasks is fine. Use names starting with "QA " for anything you create.
- Jarvis costs money: **at most 2 messages** in total.
- Keep memory low: one browser at a time, close it after each script.

## What to test

1. **Meeting QR ahead of time** (as Ana). Team → Overview: card "Upcoming meetings" lists the next meetings, each with a **QR** button. The dialog shows a scannable QR (decode it: it must equal the URL printed under it, `/checkin/<id>`), **Download PNG** (file is a PNG QR of the same URL; it is also served at `/api/team/qr/<id>`) and **Copy link**. Team → Attendance → tap a meeting date → roll-call sheet has a **QR** button next to the title.
2. **Add member** (as Ana). Team → Members → **Add member**: name, email, tier chips, h/week (placeholder = typical for tier), series chips, password (pre-generated, "New" regenerates), Admin switch, Jarvis switch (hidden when Admin is on). Submit → screen with sign-in text and Copy. Then sign in as the new member in a fresh context: works; My week shows upcoming meetings of the chosen series + Community. Errors: duplicate email, short password, as member the API `POST /api/team/members` returns 403.
3. **Jarvis per member.** As Zala (member, default): **no** floating Jarvis button, no "Jarvis" in the sidebar, no Jarvis step in the tour, `/chat` still opens if typed. As Ana: Team → click Zala → switch **Jarvis** on. Zala reloads → button and sidebar entry appear. Switch it off again at the end. Ana (admin) always has Jarvis.
4. **Jarvis lists requests** (1 message, as Ana with Jarvis visible): ask "What requests are waiting for a decision?" — answer should list pending requests (or say none) consistent with /requests.
5. **Project cards** (Board → Projects grid and list view): next to the amber "N open" badge, a rose "🔥 N due" (due by tomorrow or overdue) and red "⚡ N urgent" appear when > 0; tooltips explain. Fit on phones.
6. **Project members on create** (as Ana). Board → New project: dialog opens on the **Members** tab, hint "Admins are in every project automatically", admins not offered in the picker, **Add everyone (N)** adds all others. Create one project with only Zala → Zala sees it on her board, Nina does not. In project settings → Members there is also "Add everyone".
7. **Deadlines view.** Board header toggle **Projects | Deadlines**. Deadlines groups open tasks: Overdue / Today / Tomorrow / This week / Next week / Later / No deadline, sorted by date then priority. Filters: search, project, assignee (everyone / me / unassigned / person), priority, Show done. Counter updates. Clicking a task opens it in its project board. When a project is open on the board, Deadlines starts filtered to it. Check as member too (only their projects). Phones: no horizontal scroll.
8. **Member sheet toggles** (Team → click a member): "Vacation" and "Jarvis" rows. Only the switch itself toggles (clicking the text does nothing) and no pop-up notification appears on success.
9. **Settings page** (`/settings`): only Language, Appearance, Organisation (admins only) and Jarvis memory (only if Jarvis is visible). No LLM models, MCP servers or API keys. Organisation → "Meetings count as hours" switch (off by default): turn it on, mark Zala present in a roll call → an hour entry "Meeting: …" appears in her My week; mark her absent → it disappears. **Turn the switch off again at the end.**
10. **Meeting bar realtime**: if a meeting is open for check-in (a Google Calendar event may be open today), Zala's bar shows "I'm here"; when Ana marks Zala present in roll call, Zala's bar switches to "✓ You're in" within a few seconds without reload.
11. Anything else broken on these screens (both themes if quick).

## Report

Write `qa/batch2-report.md`: a table **# / area / problem / severity (high/med/low) / device / screenshot**, then a short list of what works. Keep it short and concrete.

# Five-minute live demo

Sandbox: https://shapers.167-233-125-44.sslip.io (fictional data). Two browser profiles signed in beforehand: **Zala Turk** (member, GO!) and **Ana Kovač** (admin). Slack channel open in a third window, phone with camera ready.

## Prepare (10 min before)

- In Google Calendar (Sandbox), a "Shapers Tech" meeting starting ~15 min after the demo begins (check-in opens 30 min before). Click **Sync** on Team → Overview so the Slack announcement and reminder (with QR) are already posted.
- A second event to move live (for the reschedule note).
- One pending older-hours request from Zala; one open task owned by Zala.
- Settings → Organisation → "Meetings count as hours": decide on or off before starting.

## Script

| Time | Who | Show | Say |
| --- | --- | --- | --- |
| 0:00–0:30 | Zala | **My week**: hours vs. tier quota, behind indicator, streak, next meetings. | "One place for the three things a member owes: tasks, hours, meetings." |
| 0:30–1:30 | Ana + Slack + phone | Slack: reminder with **QR**. Move the second event in Google Calendar → Sync → a **Rescheduled** note appears in Slack. Scan the QR with the phone → Zala is checked in. Ana's roll call and Zala's bar show it without reload. | "The calendar stays in Google, talk stays in Slack. We only read and remind." |
| 1:30–2:10 | Zala → Ana | Zala requests hours for an older date. Ana approves in **Requests**; rejection needs a reason the member sees. Handoff: ownership changes only when the recipient accepts. | "Today and yesterday are self-service; older dates go through an admin." |
| 2:10–3:00 | Ana | **Team**: who's behind and why, tiers, meeting series, Zala's history. **Add member** in one dialog. **Jarvis** switch per member. Settings: meetings count as hours (server-wide). | "Admins see the organisation; members see only themselves." |
| 3:00–3:40 | Ana | **Board**: project cards with open / 🔥 due / ⚡ urgent. **Deadlines** view with filters. | "What's burning across all projects, in one list." |
| 3:40–4:30 | Ana | **Jarvis**: "Who is behind this week, and why?", then "What requests are waiting for a decision?". Optional: dictate by voice. | "Jarvis uses the same server permissions as the signed-in user." |
| 4:30–5:00 | — | Switch UI to **Slovenian**. Close: single Go binary on PocketBase, Google Calendar read-only, Slack bot, EN/SL. | "Next: the architecture split we already started." |

## If something fails

- Slack or calendar slow: show the posts already in the channel; don't wait for the 10-minute job.
- QR outside the check-in window: Ana marks attendance in roll call instead.
- Jarvis slow: skip to the language switch.

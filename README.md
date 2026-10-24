# Shapers

A workspace for the Shapers institute in Ljubljana: volunteer tasks, weekly hours and meeting attendance in one place. Members belong to Core, Impact or GO!, each with a weekly hours commitment.

**Public sandbox:** [Open Shapers](https://shapers.167-233-125-44.sslip.io). The supplied people and activity data are fictional.

## For judges

The challenge asks for three connected workflows, for both members and admins:

| Area | Member | Admin |
| --- | --- | --- |
| Tasks | My tasks across projects; finish tasks, change priority/date, request a handoff | Board across projects; create a project in one step, assign work, inspect completed tasks by person and time |
| Hours | Log hours; compare the week with the tier quota | See who is behind and inspect individual history |
| Attendance | View recurring meetings, check in, review attendance | Record attendance for members and compare all six meeting series |

My week combines hours versus quota, a pro-rata behind indicator, a weekly streak, upcoming meetings and check-in. Weeks start on Monday in Europe/Ljubljana. The current expectation is weekly quota × weekday / 5, capped at the full quota from Friday; this formula is not yet editable.

The Board offers project grid/list views, stars and a highlight for projects with your open tasks. Tasks have an owner. A handoff stays pending until the recipient accepts in Requests; responsibility stays with the existing owner until then. Admins can cancel a finished task with a visible reason: it appears struck through and is excluded from completion statistics. Restoring it makes it count again.

Members can log today or yesterday directly. Older dates go through Requests for admin approval; rejected requests retain a visible reason. Team analytics cover members, tiers, meeting series and weeks, with member drill-down into hours, attendance and completed tasks. Attendance distinguishes present, remote, excused and unexcused.

Meetings remain in Google Calendar. Shapers reads them at startup and every ten minutes; it does not create or edit the organisation's calendar events. Communication stays in Slack; the core app writes nothing to Slack. Slack reminders and activity analytics are unfinished extras. The interface supports English and Slovenian.

## Jarvis

Jarvis is a text assistant in chat, using DeepSeek through an OpenAI-compatible API. Configuration comes from the server environment and the model is provisioned automatically for each user when configured. It answers in the language the user writes in.

Its team tools are `team_my_week`, `team_log_hours` (today/yesterday for members), `team_request_hours`, `team_who_is_behind` (admin), `team_member_report` and `team_attendance`. Board and personal calendar tools are also available. Team meetings and the private personal calendar are separate; live verification of correct meeting-tool selection remains open.

Tools act as the signed-in user. Admin-only team data is guarded on the server. UI visibility uses `can()`; backend permission checks and PocketBase collection rules enforce access. See [permissions](docs/permissions.md).

Voice input: a mic button in the Jarvis chat. Speech engines are pluggable — the browser's own speech recognition (live text, Chrome/Edge/Safari) and server-side transcription through a provider registry: Groq Whisper (default), OpenAI, or any OpenAI-compatible Whisper service, chosen by `VOICE_PROVIDER`. Provider keys stay on the server.

## Run and rebuild

The application is a Go/PocketBase backend with a React, Vite, TypeScript and Tailwind frontend embedded into a single binary. Application source, including retained upstream code and Shapers extensions, is in `app/`.

For a local build, install Go matching `app/go.mod` (currently 1.26.6), Node.js compatible with the frontend dependencies, and pnpm. From `app/frontend`, run `pnpm install --frozen-lockfile` and `pnpm build`; from `app`, run `go build -o shapers .`. Create a private `.env` using [the example](app/.env.example), then run `./shapers migrate up`, `./shapers import-sandbox ../Brief` and `./shapers serve --http=127.0.0.1:8096`. On Windows use `shapers.exe`. These are operator instructions, not actions performed for this documentation change.

The importer uses `roster.xlsx`, `meetings.ics`, `attendance flat.xlsx` and `hours.xlsx` from `Brief/`, and seeds the sandbox projects. Import is a manual step, not automatic first-start setup. The sandbox contains 20 members, six meeting series and six weeks of activity. To enable live calendar reads, import the ICS into a dedicated public Google Calendar and configure its ID and API key. Never publish environment secrets.

## Submission documents

- [Infrastructure and deployment from zero](docs/infrastructure.md)
- [What works / what doesn't yet / what the AI does](docs/status.md)
- [Ten-minute demo, including questions and fallbacks](docs/demo-script.md)
- [Remaining work](TODO.md)

## Attribution and licence

Shapers is a fork of [Workavera by xusenlin](https://github.com/xusenlin/workavera), licensed under [Apache-2.0](app/LICENSE). We retained the upstream application in `app/` and extended its Go backend, schema and frontend rather than rewriting the platform. Workavera supplies the underlying workspace, Board and chat foundation; the Shapers extensions add volunteer tiers, hours, attendance, team analytics, Requests and Jarvis team tools. Upstream copyright and licence notices are retained; see the [upstream README](app/README.md).

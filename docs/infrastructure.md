# Infrastructure

**Public URL:** https://shapers.167-233-125-44.sslip.io

One shared Hetzner VM (Ubuntu, FSN1) runs Caddy → `shapers` systemd service → one Go/PocketBase binary on `127.0.0.1:8096`. Caddy terminates HTTPS automatically. The binary embeds the React/Vite frontend and serves the API; SQLite and uploaded files live in `/opt/shapers/pb_data`. No separate frontend server or database service is needed.

**Outbound connections** (all optional except the calendar):

| Service | What for | When |
| --- | --- | --- |
| Google Calendar API | read meetings (read-only, public calendar + API key) | at start, every 10 min, and on demand |
| Slack Web API | meeting announcements (3 days), reminders (1 day, with check-in link and QR), moved/cancelled notes; admin activity signal | after each calendar sync and every 10 min; presence every 15 min |
| DeepSeek | Jarvis chat model (OpenAI-compatible) | per chat message |
| Groq / OpenAI / self-hosted Whisper | voice to text | per recording |

Slack also calls in: `POST /api/slack/events` (verified with the signing secret) for posts and reactions. Access is enforced on the server (route permissions + PocketBase collection rules); the UI only hides what the server would refuse.

## Configuration

Secrets and server-level choices live in `/opt/shapers/.env` (template: `app/.env.example`); the app loads it from its working directory and never sends keys to the browser. Organisation-wide behaviour that admins change themselves (e.g. **Meetings count as hours**) lives in the database and is switched in the app under Settings → Organisation.

| Variable | Required | Meaning |
| --- | --- | --- |
| `GOOGLE_CALENDAR_ID` | yes | public Google Calendar holding the meetings |
| `GOOGLE_CALENDAR_API_KEY` | yes | Google Cloud API key with Calendar API enabled |
| `DEEPSEEK_API_KEY` | for Jarvis | chat model key |
| `DEEPSEEK_BASE_URL` | no | default `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | no | default `deepseek-chat` |
| `GROQ_API_KEY` | for server voice | Whisper via Groq (default provider) |
| `VOICE_PROVIDER` | no | `groq` (default), `openai`, `openai-compatible` |
| `OPENAI_API_KEY` | if provider `openai` | OpenAI Whisper key |
| `VOICE_BASE_URL`, `VOICE_MODEL`, `VOICE_API_KEY` | if provider `openai-compatible` | self-hosted Whisper endpoint |
| `SLACK_BOT_TOKEN` | for Slack | bot token `xoxb-…` (scopes: chat:write, users:read, users:read.email, channels:read, channels:history, channels:join, reactions:read) |
| `SLACK_SIGNING_SECRET` | for Slack events | verifies `/api/slack/events` |
| `SLACK_CHANNEL` | no | announcement channel name (default `all-shapershackathon`) |
| `PUBLIC_URL` | for Slack links | the app's public address, used in Slack links and the reminder's QR image |
| `SANDBOX_PASSWORD` | no | password given to imported sandbox users (default `shapers2026`) |
| `SLACK_DEMO_MAPPING` | no, demo only | `1` lets admins link members to Slack users by hand (sandbox emails don't exist in Slack) |
| `TREE_DEMO` | no, demo only | `1` shows tree demo buttons (skip a day, add water) |

Without the Slack variables the Slack features are simply off; without a voice key the browser's own speech recognition is used (Chrome/Edge/Safari).

## Deploy from zero

1. Provision an Ubuntu Linux amd64 host, install Caddy, allow inbound 80/443 and arrange SSH administration. Create a system user `shapers` and `/opt/shapers`, owned by that user. Point a hostname at the host; use the URL above only for the existing VM.
2. On the build machine install Go matching `app/go.mod`, Node.js and pnpm. From the repository root, build in Bash:

   ```sh
   (cd app/frontend && pnpm install --frozen-lockfile && pnpm build)
   (cd app && GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -o shapers .)
   ```

3. Upload `app/shapers` to `/opt/shapers/shapers` and the sandbox files to `/opt/shapers/sandbox`. Make the binary executable. Create `.env` privately from the example. For live meetings, import `Brief/meetings.ics` into a dedicated public Google Calendar; configure its calendar ID and a Google Calendar API key. Configure DeepSeek for chat; voice is optional.
4. As `shapers`, with working directory `/opt/shapers`, run `./shapers migrate up --dir=/opt/shapers/pb_data` (the server also applies pending migrations on every start), then `./shapers import-sandbox /opt/shapers/sandbox --dir=/opt/shapers/pb_data`. The importer expects `roster.xlsx`, `meetings.ics`, `attendance flat.xlsx`, `hours.xlsx`; it also seeds projects. Import is manual.
5. Create `/etc/systemd/system/shapers.service`:

   ```ini
   [Unit]
   After=network-online.target
   [Service]
   User=shapers
   WorkingDirectory=/opt/shapers
   ExecStart=/opt/shapers/shapers serve --http=127.0.0.1:8096 --dir=/opt/shapers/pb_data
   Restart=on-failure
   [Install]
   WantedBy=multi-user.target
   ```

6. Add a Caddy site block for the chosen hostname with `reverse_proxy 127.0.0.1:8096`. Run `systemctl daemon-reload`, `systemctl enable --now shapers`, validate/reload Caddy, and verify `/api/health` locally and over HTTPS.

**Updates:** `bash ops/deploy.sh` builds UI, cross-compiles Go, uploads compressed chunks via SSH alias `vm`, verifies the upload, replaces the binary, restarts `shapers` and checks local health. It assumes the host, dependencies, `.env`, service and Caddy already exist; it does not install dependencies or import data. Pending migrations are applied when the service starts. Back up `pb_data` consistently before updates (stop the service for a filesystem copy); preserve private configuration separately. Remove temporary quick-login buttons before final deployment.

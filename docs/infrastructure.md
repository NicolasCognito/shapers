# Infrastructure

**Public URL:** https://shapers.167-233-125-44.sslip.io

One shared Hetzner VM (Ubuntu, FSN1) runs Caddy → `shapers` systemd service → one Go/PocketBase binary on `127.0.0.1:8096`. Caddy terminates HTTPS automatically. The binary embeds the React/Vite frontend and serves the API; SQLite and persistent files live in `/opt/shapers/pb_data`. No separate frontend server or database service is needed.

Outbound connections: read-only Google Calendar at startup/every ten minutes; DeepSeek for Jarvis; optional speech transcription provider. Browser Web Speech is a separate client strategy. Slack integration is unfinished. Authenticated routes, server permissions and PocketBase rules enforce access.

**Environment names only** (from `app/.env.example`): `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL`, `GOOGLE_CALENDAR_API_KEY`, `GOOGLE_CALENDAR_ID`, `GROQ_API_KEY`, `VOICE_PROVIDER`, `VOICE_MODEL`, `VOICE_BASE_URL`, `VOICE_API_KEY`. The OpenAI voice preset also reads `OPENAI_API_KEY` (implemented in code, absent from the example). Keep configuration private in `/opt/shapers/.env`; the app loads it from its working directory. Server voice keys never go to the browser.

## Deploy from zero

1. Provision an Ubuntu Linux amd64 host, install Caddy, allow inbound 80/443 and arrange SSH administration. Create a system user `shapers` and `/opt/shapers`, owned by that user. Point a hostname at the host; use the URL above only for the existing VM.
2. On the build machine install Go matching `app/go.mod`, Node.js and pnpm. From the repository root, build in Bash:

   ```sh
   (cd app/frontend && pnpm install --frozen-lockfile && pnpm build)
   (cd app && GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -o shapers .)
   ```

3. Upload `app/shapers` to `/opt/shapers/shapers` and the sandbox files to `/opt/shapers/sandbox`. Make the binary executable. Create `.env` privately from the example. For live meetings, import `Brief/meetings.ics` into a dedicated public Google Calendar; configure its calendar ID and a Google Calendar API key. Configure DeepSeek for chat; voice is optional.
4. As `shapers`, with working directory `/opt/shapers`, run `./shapers migrate up --dir=/opt/shapers/pb_data`, then `./shapers import-sandbox /opt/shapers/sandbox --dir=/opt/shapers/pb_data`. The importer expects `roster.xlsx`, `meetings.ics`, `attendance flat.xlsx`, `hours.xlsx`; it also seeds projects. Import is manual.
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

**Updates:** `bash ops/deploy.sh` builds UI, cross-compiles Go, uploads compressed chunks via SSH alias `vm`, verifies the upload, replaces the binary, restarts `shapers` and checks local health. It assumes the host, dependencies, `.env`, service and Caddy already exist; it does not install dependencies or import data. Apply required migrations explicitly. Back up `pb_data` consistently before updates (stop the service for a filesystem copy); preserve private configuration separately. Remove temporary quick-login buttons before final deployment. These instructions have not been executed as part of this documentation task.

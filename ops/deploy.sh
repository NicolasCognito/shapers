#!/usr/bin/env bash
# Build and ship Shapers to the Hetzner box (ssh alias `vm`), then restart.
# Usage: ops/deploy.sh [--skip-ui]
# Big scp uploads get reset on this link, so the binary goes gzipped in 4 MB parts.
set -euo pipefail
cd "$(dirname "$0")/../app"
export PATH="/c/Users/Lenovo/sdk/go/bin:$PATH"
[ "${1:-}" = "--skip-ui" ] || (cd frontend && pnpm build >/dev/null)
tmp=$(mktemp -d)
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -X main.version=$(cat VERSION)" -o "$tmp/shapers" .
gzip "$tmp/shapers" && (cd "$tmp" && split -b 4M shapers.gz part_)
ssh vm "rm -rf /opt/shapers/incoming && mkdir -p /opt/shapers/incoming"
for p in "$tmp"/part_*; do
  for i in 1 2 3 4; do ssh vm "cat > /opt/shapers/incoming/$(basename "$p")" < "$p" && break; [ $i = 4 ] && exit 1; done
done
sum=$(md5sum "$tmp/shapers.gz" | cut -d' ' -f1)
ssh vm "set -e; cd /opt/shapers/incoming; cat part_* > shapers.gz; [ \$(md5sum shapers.gz | cut -d' ' -f1) = $sum ]
  gunzip -c shapers.gz > ../shapers.new; cd ..; rm -rf incoming; chmod 755 shapers.new; mv shapers.new shapers
  chown shapers:shapers shapers; systemctl restart shapers; sleep 2; systemctl is-active shapers; curl -fsS http://127.0.0.1:8096/api/health"
rm -rf "$tmp"
echo; echo "deployed: https://shapers.167-233-125-44.sslip.io"

#!/usr/bin/env bash
# Deploy the committed HEAD to the DIPP FRUICT server (AWS, same host as DIPP).
#   https://crm-dipp.unisim-soft.site  →  nginx  →  127.0.0.1:3001 (pm2 "crm-dipp")
# Usage (Git Bash):  bash scripts/deploy.sh
# Only committed code is shipped (git archive); the server keeps its own .env.
set -euo pipefail

KEY="${DEPLOY_KEY:-$HOME/Downloads/dipp-key.pem}"
HOST="${DEPLOY_HOST:-ubuntu@dipp.unisim-soft.site}"
DIR=/opt/crm-oracle
cd "$(dirname "$0")/.."

[ -f "$KEY" ] || { echo "SSH key not found: $KEY (set DEPLOY_KEY)"; exit 1; }
[ -z "$(git status --porcelain -- app components lib hooks proxy.ts package.json package-lock.json public)" ] \
  || echo "! Uncommitted changes are NOT deployed — only $(git rev-parse --short HEAD)"

TMP="$(mktemp -d)"
git archive --format=tar.gz -o "$TMP/crm.tgz" HEAD
echo "→ uploading $(git rev-parse --short HEAD)…"
scp -q -i "$KEY" "$TMP/crm.tgz" "$HOST:/tmp/crm.tgz"
rm -rf "$TMP"

ssh -i "$KEY" "$HOST" "bash -s" <<EOF
set -euo pipefail
cd $DIR
OLD_LOCK=\$(sha1sum package-lock.json 2>/dev/null | cut -d' ' -f1 || true)
tar -xzf /tmp/crm.tgz -C $DIR && rm -f /tmp/crm.tgz
if [ "\$OLD_LOCK" != "\$(sha1sum package-lock.json | cut -d' ' -f1)" ] || [ ! -d node_modules ]; then
  echo "→ npm ci"; npm ci --no-audit --no-fund --loglevel=error
fi
echo "→ build"
NODE_OPTIONS=--max-old-space-size=1536 NEXT_TELEMETRY_DISABLED=1 npx next build > /tmp/crm-build.log 2>&1 \
  || { tail -40 /tmp/crm-build.log; echo "BUILD FAILED — the running version was left as is"; exit 1; }
pm2 reload crm-dipp --update-env >/dev/null && pm2 save >/dev/null
sleep 3
curl -s -o /dev/null -w "→ health: %{http_code}\n" http://127.0.0.1:3001/
EOF
echo "✓ deployed: https://crm-dipp.unisim-soft.site"

#!/usr/bin/env bash
# Install the GoodGrails remote MCP + Cloudflare quick tunnel as systemd units.
# Run as root on the hub. Idempotent.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE=/root/.config/goodgrails/mcp.env

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Create it first:" >&2
  cat >&2 <<'EOF'
SELLER_API_URL=https://goodgrails-seller.tradesprior.workers.dev
SELLER_ADMIN_TOKEN=<admin bearer token>
MCP_TOKEN=<long random shared secret>
PORT=8931
HOST=127.0.0.1
EOF
  exit 1
fi

install -m 0644 "$REPO_DIR/deploy/goodgrails-mcp.service" /etc/systemd/system/goodgrails-mcp.service
install -m 0644 "$REPO_DIR/deploy/goodgrails-mcp-tunnel.service" /etc/systemd/system/goodgrails-mcp-tunnel.service

# Point the unit at this checkout in case it moved.
sed -i "s#^WorkingDirectory=.*#WorkingDirectory=$REPO_DIR#" /etc/systemd/system/goodgrails-mcp.service

systemctl daemon-reload
systemctl enable --now goodgrails-mcp.service
systemctl enable --now goodgrails-mcp-tunnel.service

sleep 6
echo "mcp:    $(systemctl is-active goodgrails-mcp.service)"
echo "tunnel: $(systemctl is-active goodgrails-mcp-tunnel.service)"
echo -n "public: "
grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' /var/log/goodgrails-tunnel.log | tail -1 || true

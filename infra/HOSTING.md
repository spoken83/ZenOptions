# Hosting Setup — zenoptions.app

This Mac hosts ZenOptions locally and serves it to the internet via the same
Cloudflare Tunnel used by gordonfrois.com. No port forwarding required.

---

## Architecture

```
Visitor → Cloudflare Edge
              ↓  (same Cloudflare Tunnel c0e5b907-... over QUIC — outbound only)
         cloudflared (daemon on this Mac)
              ↓
         Caddy on localhost:8081 (reverse proxy)
              ↓
         Node.js (Express) on localhost:5000
              ↓
         Neon PostgreSQL (cloud — same DB as always)
         + Python subprocess (Tiger Brokers fetch)
```

TLS is handled entirely by Cloudflare. Caddy serves plain HTTP locally.

---

## Services (all auto-start on login)

| Service | What it does | Config |
|---|---|---|
| **Node.js** | Express server (API + static frontend) | `dist/index.js`, env from `.env` |
| **Caddy** | Reverse proxy on :8081 → Node :5000 | `/opt/homebrew/etc/Caddyfile` |
| **cloudflared** | Maintains tunnel to Cloudflare edge | `~/.cloudflared/config.yml` |

Check service status:
```bash
launchctl list | grep zenoptions             # Node.js process
brew services info caddy                     # Caddy
launchctl list | grep cloudflare             # Tunnel
tail -f ~/Library/Logs/com.zenoptions.log    # Node.js stdout
tail -f ~/Library/Logs/com.zenoptions.err.log # Node.js stderr
```

Restart services:
```bash
launchctl unload ~/Library/LaunchAgents/com.zenoptions.plist
launchctl load  ~/Library/LaunchAgents/com.zenoptions.plist
brew services restart caddy
```

---

## Deploying changes

```bash
cd /Users/froisagent/ZenOptions
npm run build
launchctl unload ~/Library/LaunchAgents/com.zenoptions.plist
launchctl load  ~/Library/LaunchAgents/com.zenoptions.plist
```

---

## Key credentials & IDs

| Item | Value |
|---|---|
| Cloudflare Zone ID | *(zenoptions.app zone — get from Cloudflare dashboard)* |
| Cloudflare Tunnel ID | `1125655c-aaf4-4fed-bd5f-41806873d74d` (same tunnel as gordonfrois.com) |
| Node.js port | `5000` |
| Caddy proxy port | `8081` |
| Database | Neon PostgreSQL (cloud) — no local DB needed |

---

## Environment variables

All secrets live in `/Users/froisagent/ZenOptions/.env`. The launchd agent
reads `NODE_ENV=production` and `PORT=5000` inline; all other vars (API keys,
DB, Auth0, etc.) are loaded by the Node.js process via `dotenv` from `.env`.

Required variables:
```
DATABASE_URL        - Neon connection string
SESSION_SECRET      - Express session secret
POLYGON_API_KEY     - Market data
OPENAI_API_KEY      - GPT-4 guidance
FRED_API_KEY        - VIX / economic data
TELEGRAM_BOT_TOKEN  - Telegram alerts
ZENADMIN_BOT_TOKEN  - Admin bot
ZENADMIN_CHAT_ID    - Admin chat ID
TIGER_ID            - Tiger Brokers account ID
TIGER_PRIVATE_KEY   - Tiger Brokers private key
AUTH0_DOMAIN        - Auth0 tenant domain
AUTH0_CLIENT_ID     - Auth0 app client ID
AUTH0_CLIENT_SECRET - Auth0 app client secret
STRIPE_SECRET_KEY   - Stripe billing (optional for now)
```

---

## File map

```
ZenOptions/
├── client/src/          ← React source (edit this)
├── dist/                ← Built output (served by Node.js/Express)
├── server/              ← Express + API routes
├── infra/
│   ├── Caddyfile        ← Reference copy of Caddy block
│   ├── com.zenoptions.plist  ← Reference copy of launchd agent
│   └── HOSTING.md       ← this file
│
~/.cloudflared/
├── config.yml           ← Tunnel ingress config (add zenoptions.app here)
│
/opt/homebrew/etc/
└── Caddyfile            ← Active Caddyfile (add :8081 block here)
│
~/Library/LaunchAgents/
└── com.zenoptions.plist ← Active launchd agent (copy from infra/)
```

---

## DNS (manage in Cloudflare for zenoptions.app)

After adding zenoptions.app to Cloudflare and pointing its nameservers there,
add these DNS records:

| Type | Name | Value | Proxied |
|---|---|---|---|
| CNAME | `zenoptions.app` | `1125655c-aaf4-4fed-bd5f-41806873d74d.cfargotunnel.com` | Yes |
| CNAME | `www` | `1125655c-aaf4-4fed-bd5f-41806873d74d.cfargotunnel.com` | Yes |

SSL/TLS mode: **Full (strict)**

Or use the CLI shortcut (once domain is in Cloudflare):
```bash
cloudflared tunnel route dns 1125655c-aaf4-4fed-bd5f-41806873d74d zenoptions.app
cloudflared tunnel route dns 1125655c-aaf4-4fed-bd5f-41806873d74d www.zenoptions.app
```

---

## Initial setup (one-time)

1. Add zenoptions.app to Cloudflare, update nameservers at your registrar
2. Add DNS CNAME records above
3. Update `~/.cloudflared/config.yml` — add ingress rules (see below)
4. Update `/opt/homebrew/etc/Caddyfile` — add :8081 block (see below)
5. Copy launchd plist and load it:
   ```bash
   cp infra/com.zenoptions.plist ~/Library/LaunchAgents/
   launchctl load ~/Library/LaunchAgents/com.zenoptions.plist
   ```
6. Restart Caddy and cloudflared:
   ```bash
   brew services restart caddy
   launchctl unload ~/Library/LaunchAgents/com.cloudflare.cloudflared.plist
   launchctl load  ~/Library/LaunchAgents/com.cloudflare.cloudflared.plist
   ```

### Additions to ~/.cloudflared/config.yml

```yaml
  - hostname: zenoptions.app
    service: http://localhost:8081
  - hostname: www.zenoptions.app
    service: http://localhost:8081
```
(insert before the final `- service: http_status:404` catch-all)

### Addition to /opt/homebrew/etc/Caddyfile

```
:8081 {
    reverse_proxy localhost:5000
    encode gzip
    @static {
        path *.js *.css *.png *.jpg *.jpeg *.gif *.svg *.ico *.woff *.woff2
    }
    header @static Cache-Control "public, max-age=31536000, immutable"
}
```

---

## If the Mac restarts

Node.js and Caddy auto-start on login. Site should be back within ~30 seconds.
No manual intervention needed.

## Troubleshooting

1. Check Node is running: `curl http://localhost:5000/api/health`
2. Check Caddy proxying: `curl http://localhost:8081/api/health`
3. Check tunnel: `tail -20 ~/Library/Logs/com.cloudflare.cloudflared.err.log`
4. Check Node logs: `tail -50 ~/Library/Logs/com.zenoptions.err.log`

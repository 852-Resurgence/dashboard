# 852 Resurgence — Staff Panel

A proxied staff dashboard for the 852 Resurgence Discord community. The panel provides moderation tools, member management, Minecraft server console access, bot logs, and MediaWiki administration — all behind Discord OAuth role-based access.

## Stack

- **Frontend:** Vue 3 + Vite + Pinia
- **Backend:** Node.js + Express + Discord.js
- **Database:** SQLite (WAL mode)
- **Integrations:** Google Sheets, Crafty Controller, MediaWiki
- **Deployment:** Docker Compose + GHCR images via GitHub Actions

## Features

| Page | Description |
|------|-------------|
| Dashboard | Member count, MC server status, recent warnings |
| Warnings | Issue/escalate/expire warnings with configurable levels |
| Members | Searchable member list synced to Google Sheets weekly |
| Console | Live Minecraft console via Crafty WebSocket/SSE |
| Bot logs | Winston log ring buffer viewer |
| MediaWiki | Create users and manage wiki permissions |
| Setup | First-run admin wizard for warning levels, channels, and roles |

The Discord bot also handles Arcane level parsing, introduction validation, anonymous vents, slash commands (`/warn`, `/syncmembers`, `/vent`), and scheduled unbans.

On first login, admins with incomplete setup are redirected to `/setup` to configure warning levels and role mappings before accessing the panel.

## Quick start (development)

1. Copy `.env.example` to `.env` and fill in all values.
2. Place your Google service account key at `secrets/gsa-key.json`.
3. Start the stack:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

- Frontend dev server: http://127.0.0.1:5173
- Backend API: http://127.0.0.1:3001

Or run locally without Docker:

```bash
cd src/backend && npm install && npm run dev
cd src/frontend && npm install && npm run dev
```

## Production

```bash
docker compose up -d
```

All persistent files live under **`/mnt/data/852r-panel`** (see [deploy/MIGRATE-TO-MNT-DATA.md](deploy/MIGRATE-TO-MNT-DATA.md)).

## Environment

See `.env.example` for the full list. Key groups:

- **Discord:** OAuth client, bot token, guild/role/channel IDs
- **Ranks:** Role IDs and Arcane level thresholds
- **Sheets:** Service account path and spreadsheet IDs
- **Crafty:** API URL, key, and server UUID
- **Wiki:** Bot password credentials
- **Auth:** JWT secret and cookie domain

Generate a JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## CI

Pushes to `main` build and publish `852r-panel-backend` and `852r-panel-frontend` images to GHCR.

# Personal Assistant — Copilot SDK + Telegram

A personal AI assistant powered by [GitHub Copilot SDK](https://github.com/github/copilot-sdk) that communicates via Telegram.

## Features

- 💬 **Conversational AI** — Chat with GitHub Copilot through Telegram
- 🔍 **Web Search** — Search the web for current information
- 💻 **Code Generation** — Generate and explain code in any language
- 📋 **Task Tracking** — Add, list, and manage tasks (SQLite by default, or Google Tasks)
- ⏰ **Reminders** — Set reminders via Telegram polling (default) or Google Calendar notifications
- 📁 **File Management** — Read, write, and list files
- 🔄 **Session Management** — Per-user Copilot sessions with auto-cleanup

## Prerequisites

1. **Node.js 20+**
2. **GitHub Copilot CLI** — Install and authenticate:
   ```bash
   npm install -g @github/copilot
   copilot auth login
   ```
3. **Telegram Bot Token** — Create via [@BotFather](https://t.me/BotFather) on Telegram

## Setup

```bash
# Install dependencies
npm install

# Copy env template and fill in your values
cp .env.example .env
# Edit .env with your TELEGRAM_BOT_TOKEN

# Build
npm run build

# Run
npm start
```

## Configuration (.env)

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | ✅ | Bot token from @BotFather |
| `ALLOWED_USERS` | | Comma-separated Telegram user IDs (empty = no restriction) |
| `MODEL` | | Copilot model (default: `gpt-4.1`) |
| `COPILOT_CLI_URL` | | External CLI server URL (empty = local subprocess) |
| `DATA_DIR` | | Data directory for SQLite (default: `./data`) |
| `USE_GOOGLE_WORKSPACE` | | Set to `true` to use Google Tasks + Calendar instead of SQLite |

## CLI Connection Modes

### Local Subprocess (Default)
The SDK spawns the Copilot CLI as a child process automatically. Best for personal use.

### Headless Server
Run the CLI as a separate server for backend/production deployments:
```bash
# Start CLI server
copilot --headless --port 4321

# Set in .env
COPILOT_CLI_URL=localhost:4321
```

## Telegram Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message |
| `/help` | Show available features |
| `/new` | Start a fresh conversation |
| `/tasks` | Show your tasks |
| `/model <name>` | Switch AI model |
| `/status` | Bot status info |

## Google Workspace Integration (Optional)

By default, tasks and reminders are stored locally in SQLite. To sync them with Google Tasks and Google Calendar instead, install and authenticate the [Google Workspace CLI](https://github.com/googleworkspace/cli):

```bash
# Install gws CLI
npm install -g @googleworkspace/cli

# Authenticate with your Google account
gws auth login

# Verify authentication
gws auth whoami
```

Then enable the integration in your `.env`:

```
USE_GOOGLE_WORKSPACE=true
```

When enabled:
- **Tasks** are stored in Google Tasks (synced across all your devices)
- **Reminders** create Google Calendar events with popup notifications
- Local SQLite polling is disabled — Google Calendar handles notifications natively

For full gws CLI documentation, see the [official repository](https://github.com/googleworkspace/cli).

## Development

```bash
# Watch mode (auto-recompile on changes)
npm run dev

# In another terminal, run the bot
npm start
```

## Architecture

```
Telegram ←→ grammy Bot ←→ Session Manager ←→ Copilot SDK ←→ CLI ←→ LLM
                                                   ↕
                                             Custom Tools:
                                             web-search, file-manager,
                                             task-tracker, code-gen
```

Each Telegram user gets their own Copilot session. Sessions auto-cleanup after 30 minutes of inactivity.

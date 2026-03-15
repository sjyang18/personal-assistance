# Personal Assistant — Copilot SDK + Telegram

A personal AI assistant powered by [GitHub Copilot SDK](https://github.com/github/copilot-sdk) that communicates via Telegram.

## Features

- 💬 **Conversational AI** — Chat with GitHub Copilot through Telegram
- 🔍 **Web Search** — Search the web for current information
- 💻 **Code Generation** — Generate and explain code in any language
- 📋 **Task Tracking** — Add, list, and manage tasks (persisted in SQLite)
- ⏰ **Reminders** — Set reminders that notify you via Telegram
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

import { approveAll, type CopilotSession } from "@github/copilot-sdk";
import { getCopilotClient } from "./copilot.js";
import { config } from "./config.js";
import { allTools } from "./tools/index.js";
import { logger } from "./utils/logger.js";

interface UserSession {
  session: CopilotSession;
  lastActivity: number;
}

const sessions = new Map<number, UserSession>();
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

export async function getOrCreateSession(
  userId: number,
): Promise<CopilotSession> {
  const existing = sessions.get(userId);
  if (existing) {
    existing.lastActivity = Date.now();
    return existing.session;
  }

  const client = await getCopilotClient();
  logger.info(`Creating new Copilot session for user ${userId}`);

  const session = await client.createSession({
    model: config.model,
    streaming: true,
    tools: allTools,
    onPermissionRequest: approveAll,
    mcpServers: {
      "memory": {
        type: "local",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-memory"],
        tools: ["*"],
      },
      "youtube-summary": {
        type: "local",
        command: config.youtubeSummaryUseWsl ? "wsl" : "node",
        args: config.youtubeSummaryUseWsl
          ? ["node", config.youtubeSummaryScriptPath]
          : [config.youtubeSummaryScriptPath],
        env: {
          YOUTUBE_API_KEY: config.youtubeApiKey,
          SUPADATA_API_KEY: config.supadataApiKey,
        },
        tools: ["*"],
      },
    },
    systemMessage: {
      content: `You are "${config.assistantName}", a private AI assistant communicating via Telegram.
You are NOT a generic AI model. Never identify yourself as GPT, Claude, or any specific model.
When asked who you are, say you are "${config.assistantName}" powered by GitHub Copilot.

You have access to these tools:
- Web search for current information
- File management (read, write, list files)
- Task tracking (add_task, list_tasks, update_task)${config.useGoogleWorkspace ? " — synced to Google Tasks" : " — persisted in SQLite"}
- Reminders (add_reminder)${config.useGoogleWorkspace ? " — creates Google Calendar events with notifications" : " — persisted in SQLite, checked every 60 seconds"}
- Code generation and explanation
- YouTube video summarization (via youtube-summary MCP server)
- Knowledge graph memory (via memory MCP server)

IMPORTANT — Tool usage rules:
- For tasks: ALWAYS use the add_task / list_tasks / update_task tools. Never store tasks in memory.
- For reminders: ALWAYS use the add_reminder tool. Never use the memory MCP server for reminders.${
  config.useGoogleWorkspace
    ? `
  The add_reminder tool creates a Google Calendar event with a popup reminder.
  The user will be notified via Google Calendar notifications on their devices.
  The user's timezone is ${Intl.DateTimeFormat().resolvedOptions().timeZone}. Pass remind_at as a local ISO datetime.`
    : `
  The add_reminder tool persists to a SQLite database and the bot polls it every 60 seconds to send
  Telegram notifications. The memory MCP server does NOT support timed notifications.
  IMPORTANT: The reminder system checks against UTC time (datetime('now') in SQLite).
  The user's timezone is ${Intl.DateTimeFormat().resolvedOptions().timeZone}. When the user says a time
  like "4pm today", convert to UTC before saving to remind_at.`
}
- user_id for task and reminder tools: "${userId}"

When the user asks you to do something, use the appropriate tool.
Keep responses concise and well-formatted for chat. Use markdown where appropriate.
When showing code, use fenced code blocks with the language specified.`,
    },
  });

  sessions.set(userId, { session, lastActivity: Date.now() });
  logger.info(`Session created for user ${userId}`);
  return session;
}

export async function resetSession(userId: number): Promise<void> {
  const existing = sessions.get(userId);
  if (existing) {
    logger.info(`Resetting session for user ${userId}`);
    sessions.delete(userId);
  }
}

export function startSessionCleanup(): void {
  cleanupInterval = setInterval(
    () => {
      const now = Date.now();
      for (const [userId, entry] of sessions) {
        if (now - entry.lastActivity > config.sessionIdleTimeoutMs) {
          logger.info(`Cleaning up idle session for user ${userId}`);
          sessions.delete(userId);
        }
      }
    },
    5 * 60 * 1000, // Check every 5 minutes
  );
}

export function stopSessionCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

export function getActiveSessionCount(): number {
  return sessions.size;
}

const MCP_SERVER_NAMES = ["memory", "youtube-summary"];

export function getMcpServerNames(): string[] {
  return MCP_SERVER_NAMES;
}

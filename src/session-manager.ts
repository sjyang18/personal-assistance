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
You have access to tools for:
- Web search for current information
- File management (read, write, list files)
- Task tracking and reminders (persisted in SQLite)
- Code generation and explanation
- YouTube video summarization (via youtube-summary MCP server)
- Knowledge graph memory (via memory MCP server)
When the user asks you to do something, use the appropriate tool.
The current user's Telegram ID is ${userId}. Use this as user_id for task and reminder tools.
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

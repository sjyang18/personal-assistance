import { Bot, type Context } from "grammy";
import { config } from "./config.js";
import {
  getOrCreateSession,
  resetSession,
  getActiveSessionCount,
  getMcpServerNames,
} from "./session-manager.js";
import {
  getDueReminders,
  listTasksDirect,
  listRemindersDirect,
  cleanupOldEntries,
} from "./tools/task-tracker.js";
import { splitMessage } from "./utils/telegram.js";
import { allTools } from "./tools/index.js";
import { logger } from "./utils/logger.js";

let reminderInterval: ReturnType<typeof setInterval> | null = null;

function isAllowed(ctx: Context): boolean {
  if (config.allowedUsers.length === 0) return true;
  return config.allowedUsers.includes(ctx.from?.id ?? 0);
}

export function createBot(): Bot {
  const bot = new Bot(config.telegramToken);

  // Access control middleware
  bot.use(async (ctx, next) => {
    if (!isAllowed(ctx)) {
      await ctx.reply("⛔ You are not authorized to use this bot.");
      return;
    }
    await next();
  });

  // /start command
  bot.command("start", async (ctx) => {
    await ctx.reply(
      "👋 *Welcome to your Personal Assistant\\!*\n\n" +
        "I'm powered by GitHub Copilot and can help you with:\n\n" +
        "💬 General conversation & questions\n" +
        "🔍 Web search for current info\n" +
        "💻 Code generation & explanation\n" +
        "📋 Task tracking & management\n" +
        "⏰ Reminders\n" +
        "📁 File management\n\n" +
        "Just send me a message to get started\\!\n\n" +
        "*Commands:*\n" +
        "/new \\- Start a fresh conversation\n" +
        "/tasks \\- Show your tasks\n" +
        "/help \\- Show this message",
      { parse_mode: "MarkdownV2" },
    );
  });

  // /help command
  bot.command("help", async (ctx) => {
    await ctx.reply(
      "📖 *Help*\n\n" +
        "*Chat:* Just type any message\n" +
        "*Web search:* Ask me to search for something\n" +
        "*Code:* Ask me to write or explain code\n" +
        "*Tasks:* \"Add task: buy groceries\" or \"show my tasks\"\n" +
        "*Reminders:* \"Remind me to call Bob at 3pm\"\n" +
        "*Files:* \"Read file config\\.ts\" or \"List files in src/\"\n\n" +
        "*Commands:*\n" +
        "/new \\- Fresh conversation \\(clears context\\)\n" +
        "/tasks \\- Quick task list\n" +
        "/model \\- Switch AI model\n" +
        "/status \\- Bot status",
      { parse_mode: "MarkdownV2" },
    );
  });

  // /new command — reset session
  bot.command("new", async (ctx) => {
    const userId = ctx.from!.id;
    await resetSession(userId);
    await ctx.reply("🔄 Fresh conversation started! How can I help?");
  });

  // /tasks — quick view (reads from SQLite or Google Workspace)
  bot.command("tasks", async (ctx) => {
    const userId = String(ctx.from!.id);
    const tasks = await listTasksDirect(userId);
    const reminders = await listRemindersDirect(userId);

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    let msg = "*📋 Tasks & Reminders*\n\n";

    if (tasks.length === 0 && reminders.length === 0) {
      msg += "No pending tasks or reminders.";
    } else {
      if (tasks.length > 0) {
        msg += "*Tasks:*\n";
        for (const t of tasks) {
          const status = t.status === "in_progress" ? "🔄" : "⬜";
          const due = t.due_date ? ` (due: ${t.due_date})` : "";
          msg += `${status} ${t.title}${due}\n`;
        }
      }
      if (reminders.length > 0) {
        if (tasks.length > 0) msg += "\n";
        msg += "*Reminders:*\n";
        for (const r of reminders) {
          if (config.useGoogleWorkspace) {
            const localTime = new Date(r.remind_at).toLocaleString("en-US", { timeZone: tz });
            msg += `⏰ ${r.message} — ${localTime}\n`;
          } else {
            const localTime = new Date(r.remind_at + "Z").toLocaleString("en-US", { timeZone: tz });
            msg += `⏰ ${r.message} — ${localTime}\n`;
          }
        }
      }
    }

    try {
      await ctx.reply(msg, { parse_mode: "Markdown" });
    } catch {
      await ctx.reply(msg);
    }
  });

  // /model — switch model
  bot.command("model", async (ctx) => {
    const modelName = ctx.match?.trim();
    if (!modelName) {
      await ctx.reply(
        "Usage: /model <name>\nExamples: gpt-4.1, gpt-5, claude-sonnet-4",
      );
      return;
    }
    await resetSession(ctx.from!.id);
    config.model = modelName;
    await ctx.reply(`✅ Model switched to *${modelName}*. Starting fresh session.`, {
      parse_mode: "Markdown",
    });
  });

  // /status — bot info
  bot.command("status", async (ctx) => {
    const mode = config.copilotCliUrl ? `Remote (${config.copilotCliUrl})` : "Local subprocess";
    await ctx.reply(
      `🤖 *Bot Status*\n\n` +
        `Model: ${config.model}\n` +
        `CLI Mode: ${mode}\n` +
        `Active sessions: ${getActiveSessionCount()}\n` +
        `Your ID: ${ctx.from!.id}`,
      { parse_mode: "Markdown" },
    );
  });

  // /tools — list all registered tools and MCP servers
  bot.command("tools", async (ctx) => {
    const customTools = allTools.map((t) => `  • ${t.name}`).join("\n");
    const mcpServers = getMcpServerNames().map((s) => `  • ${s}`).join("\n");
    await ctx.reply(
      `🔧 *Registered Tools*\n\n` +
        `*Custom Tools:*\n${customTools}\n\n` +
        `*MCP Servers:*\n${mcpServers}`,
      { parse_mode: "Markdown" },
    );
  });

  // Message handler — bridge to Copilot
  bot.on("message:text", async (ctx) => {
    const userId = ctx.from!.id;
    const text = ctx.message.text;

    try {
      const session = await getOrCreateSession(userId);
      await handleCopilotMessage(ctx, session, text);
    } catch (err) {
      logger.error(`Error handling message from ${userId}:`, err);

      // If session is broken, reset and retry once
      if (String(err).includes("session") || String(err).includes("EPIPE")) {
        await resetSession(userId);
        try {
          const session = await getOrCreateSession(userId);
          await handleCopilotMessage(ctx, session, text);
        } catch (retryErr) {
          logger.error(`Retry failed for ${userId}:`, retryErr);
          await ctx.reply("❌ Something went wrong. Please try /new to start fresh.");
        }
      } else {
        await ctx.reply("❌ An error occurred. Please try again.");
      }
    }
  });

  // SQLite-only: clean up old entries and start reminder polling
  if (!config.useGoogleWorkspace) {
    try { cleanupOldEntries(); } catch { /* ignore */ }

    reminderInterval = setInterval(async () => {
      try {
        const reminders = getDueReminders();
        for (const r of reminders) {
          try {
            await bot.api.sendMessage(
              parseInt(r.user_id, 10),
              `⏰ *Reminder:* ${r.message}`,
              { parse_mode: "Markdown" },
            );
          } catch (err) {
            logger.error(`Failed to send reminder to ${r.user_id}:`, err);
          }
        }
      } catch {
        // DB might not be initialized yet
      }
    }, 60_000); // Check every minute
  } else {
    logger.info("Google Workspace mode enabled — skipping local reminder polling");
  }

  return bot;
}

async function handleCopilotMessage(
  ctx: Context,
  session: import("@github/copilot-sdk").CopilotSession,
  prompt: string,
): Promise<void> {
  // Show typing indicator
  await ctx.replyWithChatAction("typing");

  // Keep typing while waiting
  const typingInterval = setInterval(() => {
    ctx.replyWithChatAction("typing").catch(() => {});
  }, 4000);

  try {
    // Collect the full response
    let fullResponse = "";

    session.on("assistant.message_delta", (event) => {
      fullResponse += event.data.deltaContent;
    });

    const done = new Promise<void>((resolve, reject) => {
      session.on("session.idle", () => resolve());
      session.on("session.error", (event) =>
        reject(new Error(event.data.message)),
      );
      // Timeout after 5 minutes
      setTimeout(() => reject(new Error("Response timeout")), 5 * 60 * 1000);
    });

    await session.send({ prompt });
    await done;

    clearInterval(typingInterval);

    if (!fullResponse.trim()) {
      await ctx.reply("🤔 I didn't get a response. Could you try rephrasing?");
      return;
    }

    // Split and send long messages
    const chunks = splitMessage(fullResponse.trim());
    for (const chunk of chunks) {
      try {
        await ctx.reply(chunk, { parse_mode: "Markdown" });
      } catch {
        // If markdown fails, send as plain text
        await ctx.reply(chunk);
      }
    }
  } finally {
    clearInterval(typingInterval);
  }
}

export function stopReminders(): void {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
  }
}

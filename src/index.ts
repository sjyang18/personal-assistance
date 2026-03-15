import { validateConfig } from "./config.js";
import { getCopilotClient, stopCopilotClient } from "./copilot.js";
import { createBot, stopReminders } from "./bot.js";
import {
  startSessionCleanup,
  stopSessionCleanup,
} from "./session-manager.js";
import { logger } from "./utils/logger.js";

async function main(): Promise<void> {
  logger.info("🚀 Starting Personal Assistant...");

  // Validate configuration
  validateConfig();

  // Initialize Copilot client
  await getCopilotClient();

  // Start session cleanup
  startSessionCleanup();

  // Create and start the Telegram bot
  const bot = createBot();

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`\n${signal} received. Shutting down gracefully...`);
    stopReminders();
    stopSessionCleanup();
    bot.stop();
    await stopCopilotClient();
    logger.info("Goodbye! 👋");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Start the bot
  logger.info("🤖 Telegram bot starting...");
  await bot.start({
    onStart: (botInfo) => {
      logger.info(`✅ Bot @${botInfo.username} is running!`);
      logger.info("Send /start to your bot on Telegram to begin.");
    },
  });
}

main().catch((err) => {
  logger.error("Fatal error:", err);
  process.exit(1);
});

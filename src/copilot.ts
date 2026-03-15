import { CopilotClient } from "@github/copilot-sdk";
import { config } from "./config.js";
import { logger } from "./utils/logger.js";

let client: CopilotClient | null = null;

export async function getCopilotClient(): Promise<CopilotClient> {
  if (client) return client;

  const opts: Record<string, unknown> = {};
  if (config.copilotCliUrl) {
    logger.info(`Connecting to external CLI server at ${config.copilotCliUrl}...`);
    opts.cliUrl = config.copilotCliUrl;
  } else {
    logger.info("Starting Copilot CLI as local subprocess...");
  }

  client = new CopilotClient(opts);
  logger.info(`Copilot client ready (model: ${config.model})`);
  return client;
}

export async function stopCopilotClient(): Promise<void> {
  if (client) {
    logger.info("Stopping Copilot client...");
    await client.stop();
    client = null;
    logger.info("Copilot client stopped");
  }
}

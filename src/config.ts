import "dotenv/config";

export const config = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  allowedUsers: process.env.ALLOWED_USERS
    ? process.env.ALLOWED_USERS.split(",").map((id) => parseInt(id.trim(), 10))
    : [],
  model: process.env.MODEL ?? "gpt-4.1",
  copilotCliUrl: process.env.COPILOT_CLI_URL ?? "",
  youtubeApiKey: process.env.YOUTUBE_API_KEY ?? "",
  supadataApiKey: process.env.SUPADATA_API_KEY ?? "",
  youtubeSummaryUseWsl: process.env.YOUTUBE_SUMMARY_USE_WSL === "true",
  youtubeSummaryScriptPath: process.env.YOUTUBE_SUMMARY_SCRIPT_PATH ?? "",
  dataDir: process.env.DATA_DIR ?? "./data",
  useGoogleWorkspace: process.env.USE_GOOGLE_WORKSPACE === "true",
  assistantName: process.env.ASSISTANT_NAME ?? "Personal Assistant",
  sessionIdleTimeoutMs: 30 * 60 * 1000, // 30 minutes
};

export function validateConfig(): void {
  if (!config.telegramToken || config.telegramToken === "your_bot_token_here") {
    throw new Error(
      "TELEGRAM_BOT_TOKEN is not set. Copy .env.example to .env and fill in your bot token.",
    );
  }
}

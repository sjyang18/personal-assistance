const levels = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type Level = keyof typeof levels;

const currentLevel: Level = (process.env.LOG_LEVEL as Level) ?? "info";

function log(level: Level, ...args: unknown[]): void {
  if (levels[level] < levels[currentLevel]) return;
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${level.toUpperCase()}]`;
  if (level === "error") {
    console.error(prefix, ...args);
  } else if (level === "warn") {
    console.warn(prefix, ...args);
  } else {
    console.log(prefix, ...args);
  }
}

export const logger = {
  debug: (...args: unknown[]) => log("debug", ...args),
  info: (...args: unknown[]) => log("info", ...args),
  warn: (...args: unknown[]) => log("warn", ...args),
  error: (...args: unknown[]) => log("error", ...args),
};

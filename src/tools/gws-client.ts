import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function runGws(
  args: string[],
  options?: { timeout?: number },
): Promise<unknown> {
  const timeout = options?.timeout ?? 30_000;
  const { stdout, stderr } = await execFileAsync("gws", args, {
    timeout,
    windowsHide: true,
  });

  const output = stdout.trim();
  if (!output) {
    if (stderr.trim()) {
      throw new Error(`gws error: ${stderr.trim()}`);
    }
    return {};
  }

  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`gws returned non-JSON: ${output}`);
  }
}

export async function gwsTasks(
  resource: string,
  method: string,
  params?: Record<string, unknown>,
  json?: Record<string, unknown>,
): Promise<unknown> {
  const args = ["tasks", resource, method];
  if (params) args.push("--params", JSON.stringify(params));
  if (json) args.push("--json", JSON.stringify(json));
  return runGws(args);
}

export async function gwsCalendar(
  resource: string,
  method: string,
  params?: Record<string, unknown>,
  json?: Record<string, unknown>,
): Promise<unknown> {
  const args = ["calendar", resource, method];
  if (params) args.push("--params", JSON.stringify(params));
  if (json) args.push("--json", JSON.stringify(json));
  return runGws(args);
}

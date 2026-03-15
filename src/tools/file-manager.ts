import { defineTool } from "@github/copilot-sdk";
import * as fs from "node:fs";
import * as path from "node:path";

const ALLOWED_ROOT = process.cwd();

function safePath(filePath: string): string {
  const resolved = path.resolve(ALLOWED_ROOT, filePath);
  if (!resolved.startsWith(ALLOWED_ROOT)) {
    throw new Error("Access denied: path is outside working directory");
  }
  return resolved;
}

export const readFileTool = defineTool("read_file", {
  description:
    "Read the contents of a file. Use this when you need to examine or reference file content.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the file (relative to working dir)" },
    },
    required: ["path"],
  },
  handler: async (args: { path: string }) => {
    const p = safePath(args.path);
    if (!fs.existsSync(p)) return { error: `File not found: ${args.path}` };
    const stat = fs.statSync(p);
    if (stat.size > 100_000) return { error: "File too large (>100KB)" };
    return { path: args.path, content: fs.readFileSync(p, "utf-8") };
  },
});

export const writeFileTool = defineTool("write_file", {
  description:
    "Write content to a file. Creates the file if it doesn't exist, overwrites if it does.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to write (relative to working dir)" },
      content: { type: "string", description: "Content to write" },
    },
    required: ["path", "content"],
  },
  handler: async (args: { path: string; content: string }) => {
    const p = safePath(args.path);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, args.content, "utf-8");
    return { success: true, path: args.path, bytesWritten: Buffer.byteLength(args.content) };
  },
});

export const listFilesTool = defineTool("list_files", {
  description:
    "List files and directories at a given path. Useful for exploring directory structure.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Directory path (relative to working dir, defaults to '.')",
      },
    },
    required: [],
  },
  handler: async (args: { path?: string }) => {
    const p = safePath(args.path ?? ".");
    if (!fs.existsSync(p)) return { error: `Directory not found: ${args.path}` };
    const entries = fs.readdirSync(p, { withFileTypes: true });
    return {
      path: args.path ?? ".",
      entries: entries.slice(0, 100).map((e) => ({
        name: e.name,
        type: e.isDirectory() ? "directory" : "file",
      })),
    };
  },
});

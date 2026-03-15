import { defineTool } from "@github/copilot-sdk";
import Database from "better-sqlite3";
import { config } from "../config.js";
import * as path from "node:path";
import * as fs from "node:fs";

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(config.dataDir, { recursive: true });
  db = new Database(path.join(config.dataDir, "tasks.db"));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT DEFAULT 'pending',
      due_date TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      message TEXT NOT NULL,
      remind_at TEXT NOT NULL,
      notified INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  return db;
}

export const addTaskTool = defineTool("add_task", {
  description: "Add a new task to the user's task list.",
  parameters: {
    type: "object",
    properties: {
      user_id: { type: "string", description: "Telegram user ID" },
      title: { type: "string", description: "Task title" },
      description: { type: "string", description: "Task description (optional)" },
      due_date: {
        type: "string",
        description: "Due date in ISO format (optional), e.g. 2026-03-20",
      },
    },
    required: ["user_id", "title"],
  },
  handler: async (args: {
    user_id: string;
    title: string;
    description?: string;
    due_date?: string;
  }) => {
    const d = getDb();
    const result = d
      .prepare(
        "INSERT INTO tasks (user_id, title, description, due_date) VALUES (?, ?, ?, ?)",
      )
      .run(args.user_id, args.title, args.description ?? "", args.due_date ?? null);
    return { success: true, taskId: result.lastInsertRowid, title: args.title };
  },
});

export const listTasksTool = defineTool("list_tasks", {
  description: "List all tasks for the user, optionally filtered by status.",
  parameters: {
    type: "object",
    properties: {
      user_id: { type: "string", description: "Telegram user ID" },
      status: {
        type: "string",
        enum: ["pending", "in_progress", "done", "all"],
        description: "Filter by status (default: all)",
      },
    },
    required: ["user_id"],
  },
  handler: async (args: { user_id: string; status?: string }) => {
    const d = getDb();
    const status = args.status ?? "all";
    const rows =
      status === "all"
        ? d.prepare("SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC").all(args.user_id)
        : d
            .prepare(
              "SELECT * FROM tasks WHERE user_id = ? AND status = ? ORDER BY created_at DESC",
            )
            .all(args.user_id, status);
    return { tasks: rows, count: rows.length };
  },
});

export const updateTaskTool = defineTool("update_task", {
  description: "Update a task's status, title, or description.",
  parameters: {
    type: "object",
    properties: {
      task_id: { type: "number", description: "Task ID" },
      status: { type: "string", enum: ["pending", "in_progress", "done"] },
      title: { type: "string", description: "New title (optional)" },
    },
    required: ["task_id"],
  },
  handler: async (args: { task_id: number; status?: string; title?: string }) => {
    const d = getDb();
    if (args.status) {
      d.prepare("UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ?").run(
        args.status,
        args.task_id,
      );
    }
    if (args.title) {
      d.prepare("UPDATE tasks SET title = ?, updated_at = datetime('now') WHERE id = ?").run(
        args.title,
        args.task_id,
      );
    }
    return { success: true, taskId: args.task_id };
  },
});

export const addReminderTool = defineTool("add_reminder", {
  description: "Set a reminder for the user at a specific date/time.",
  parameters: {
    type: "object",
    properties: {
      user_id: { type: "string", description: "Telegram user ID" },
      message: { type: "string", description: "Reminder message" },
      remind_at: {
        type: "string",
        description: "When to remind, ISO datetime, e.g. 2026-03-15T14:00:00",
      },
    },
    required: ["user_id", "message", "remind_at"],
  },
  handler: async (args: { user_id: string; message: string; remind_at: string }) => {
    const d = getDb();
    const result = d
      .prepare("INSERT INTO reminders (user_id, message, remind_at) VALUES (?, ?, ?)")
      .run(args.user_id, args.message, args.remind_at);
    return { success: true, reminderId: result.lastInsertRowid, remindAt: args.remind_at };
  },
});

export function getDueReminders(): { id: number; user_id: string; message: string }[] {
  const d = getDb();
  const rows = d
    .prepare(
      "SELECT id, user_id, message FROM reminders WHERE notified = 0 AND remind_at <= datetime('now')",
    )
    .all() as { id: number; user_id: string; message: string }[];
  if (rows.length > 0) {
    const ids = rows.map((r) => r.id);
    d.prepare(`UPDATE reminders SET notified = 1 WHERE id IN (${ids.join(",")})`).run();
  }
  return rows;
}

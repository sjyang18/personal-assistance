import { defineTool } from "@github/copilot-sdk";
import Database from "better-sqlite3";
import { config } from "../config.js";
import { gwsTasks, gwsCalendar } from "./gws-client.js";
import * as path from "node:path";
import * as fs from "node:fs";

// ---------------------------------------------------------------------------
// SQLite backend (default)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Google Workspace helpers
// ---------------------------------------------------------------------------

const REMINDER_TAG_PREFIX = "[telegram-reminder:";
const NOTIFIED_TAG = "[notified]";

function makeReminderTag(userId: string): string {
  return `${REMINDER_TAG_PREFIX}${userId}]`;
}

function extractUserIdFromTag(description: string): string | null {
  const match = description.match(/\[telegram-reminder:(\d+)\]/);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// Tool: add_task
// ---------------------------------------------------------------------------

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
    if (config.useGoogleWorkspace) {
      const body: Record<string, unknown> = {
        title: args.title,
        notes: args.description ?? "",
      };
      if (args.due_date) {
        body.due = args.due_date.includes("T")
          ? args.due_date
          : `${args.due_date}T00:00:00.000Z`;
      }
      const result = (await gwsTasks("tasks", "insert", { tasklist: "@default" }, body)) as {
        id: string;
        title: string;
      };
      return { success: true, taskId: result.id, title: result.title };
    }

    // SQLite
    const d = getDb();
    const result = d
      .prepare(
        "INSERT INTO tasks (user_id, title, description, due_date) VALUES (?, ?, ?, ?)",
      )
      .run(args.user_id, args.title, args.description ?? "", args.due_date ?? null);
    return { success: true, taskId: result.lastInsertRowid, title: args.title };
  },
});

// ---------------------------------------------------------------------------
// Tool: list_tasks
// ---------------------------------------------------------------------------

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
    if (config.useGoogleWorkspace) {
      const status = args.status ?? "all";
      const showCompleted = status === "all" || status === "done";
      const params: Record<string, unknown> = {
        tasklist: "@default",
        showCompleted,
        showHidden: showCompleted,
      };
      const result = (await gwsTasks("tasks", "list", params)) as {
        items?: Array<{
          id: string;
          title: string;
          notes?: string;
          status: string;
          due?: string;
        }>;
      };
      const items = (result.items ?? []).map((t) => ({
        id: t.id,
        title: t.title,
        description: t.notes ?? "",
        status: t.status === "completed" ? "done" : "pending",
        due_date: t.due ? t.due.split("T")[0] : null,
      }));
      const filtered =
        status === "all"
          ? items
          : items.filter((t) => t.status === status);
      return { tasks: filtered, count: filtered.length };
    }

    // SQLite
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

// ---------------------------------------------------------------------------
// Tool: update_task
// ---------------------------------------------------------------------------

export const updateTaskTool = defineTool("update_task", {
  description: "Update a task's status, title, or description.",
  parameters: {
    type: "object",
    properties: {
      task_id: {
        type: "string",
        description: "Task ID (numeric for SQLite, string for Google Tasks)",
      },
      status: { type: "string", enum: ["pending", "in_progress", "done"] },
      title: { type: "string", description: "New title (optional)" },
    },
    required: ["task_id"],
  },
  handler: async (args: { task_id: string; status?: string; title?: string }) => {
    if (config.useGoogleWorkspace) {
      const body: Record<string, unknown> = {};
      if (args.status) {
        body.status = args.status === "done" ? "completed" : "needsAction";
      }
      if (args.title) {
        body.title = args.title;
      }
      await gwsTasks("tasks", "patch", { tasklist: "@default", task: args.task_id }, body);
      return { success: true, taskId: args.task_id };
    }

    // SQLite
    const d = getDb();
    const taskId = Number(args.task_id);
    if (args.status) {
      d.prepare("UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ?").run(
        args.status,
        taskId,
      );
    }
    if (args.title) {
      d.prepare("UPDATE tasks SET title = ?, updated_at = datetime('now') WHERE id = ?").run(
        args.title,
        taskId,
      );
    }
    return { success: true, taskId };
  },
});

// ---------------------------------------------------------------------------
// Tool: add_reminder
// ---------------------------------------------------------------------------

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
    if (config.useGoogleWorkspace) {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const startTime = args.remind_at.endsWith("Z") ? args.remind_at : args.remind_at;
      // Create a 15-minute event
      const start = new Date(startTime);
      const end = new Date(start.getTime() + 15 * 60 * 1000);

      const result = (await gwsCalendar(
        "events",
        "insert",
        { calendarId: "primary" },
        {
          summary: args.message,
          description: makeReminderTag(args.user_id),
          start: { dateTime: start.toISOString(), timeZone: tz },
          end: { dateTime: end.toISOString(), timeZone: tz },
          reminders: {
            useDefault: false,
            overrides: [{ method: "popup", minutes: 0 }],
          },
        },
      )) as { id: string };
      return { success: true, reminderId: result.id, remindAt: args.remind_at };
    }

    // SQLite
    const d = getDb();
    const result = d
      .prepare("INSERT INTO reminders (user_id, message, remind_at) VALUES (?, ?, ?)")
      .run(args.user_id, args.message, args.remind_at);
    return { success: true, reminderId: result.lastInsertRowid, remindAt: args.remind_at };
  },
});

// ---------------------------------------------------------------------------
// Direct-access functions (used by bot.ts /tasks command and polling)
// ---------------------------------------------------------------------------

export async function listTasksDirect(
  userId: string,
): Promise<{ id: string | number; title: string; status: string; due_date: string | null }[]> {
  if (config.useGoogleWorkspace) {
    const result = (await gwsTasks("tasks", "list", {
      tasklist: "@default",
      showCompleted: false,
    })) as {
      items?: Array<{ id: string; title: string; status: string; due?: string }>;
    };
    return (result.items ?? []).map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status === "completed" ? "done" : "pending",
      due_date: t.due ? t.due.split("T")[0] : null,
    }));
  }

  const d = getDb();
  return d
    .prepare("SELECT id, title, status, due_date FROM tasks WHERE user_id = ? AND status != 'done' ORDER BY created_at DESC")
    .all(userId) as { id: number; title: string; status: string; due_date: string | null }[];
}

export async function listRemindersDirect(
  userId: string,
): Promise<{ id: string | number; message: string; remind_at: string }[]> {
  if (config.useGoogleWorkspace) {
    const now = new Date().toISOString();
    const result = (await gwsCalendar("events", "list", {
      calendarId: "primary",
      timeMin: now,
      singleEvents: true,
      orderBy: "startTime",
      q: makeReminderTag(userId),
    })) as {
      items?: Array<{
        id: string;
        summary: string;
        description?: string;
        start: { dateTime?: string; date?: string };
      }>;
    };
    return (result.items ?? [])
      .filter((e) => e.description && !e.description.includes(NOTIFIED_TAG))
      .map((e) => ({
        id: e.id,
        message: e.summary,
        remind_at: e.start.dateTime ?? e.start.date ?? "",
      }));
  }

  const d = getDb();
  return d
    .prepare("SELECT id, message, remind_at FROM reminders WHERE user_id = ? AND notified = 0 ORDER BY remind_at")
    .all(userId) as { id: number; message: string; remind_at: string }[];
}

// Only used in SQLite mode — polls for due reminders and marks them as notified
export function getDueReminders(): { id: number; user_id: string; message: string }[] {
  if (config.useGoogleWorkspace) {
    // No local polling in gws mode — Google Calendar handles notifications
    return [];
  }

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

export function cleanupOldEntries(): void {
  if (config.useGoogleWorkspace) return;

  const d = getDb();
  d.prepare("DELETE FROM reminders WHERE notified = 1 AND created_at < datetime('now', '-7 days')").run();
  d.prepare("DELETE FROM tasks WHERE status = 'done' AND updated_at < datetime('now', '-7 days')").run();
}

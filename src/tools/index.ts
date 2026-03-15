import { webSearchTool } from "./web-search.js";
import { readFileTool, writeFileTool, listFilesTool } from "./file-manager.js";
import {
  addTaskTool,
  listTasksTool,
  updateTaskTool,
  addReminderTool,
} from "./task-tracker.js";
import { generateCodeTool, explainCodeTool } from "./code-gen.js";

export const allTools = [
  webSearchTool,
  readFileTool,
  writeFileTool,
  listFilesTool,
  addTaskTool,
  listTasksTool,
  updateTaskTool,
  addReminderTool,
  generateCodeTool,
  explainCodeTool,
];

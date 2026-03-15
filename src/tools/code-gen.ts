import { defineTool } from "@github/copilot-sdk";

export const generateCodeTool = defineTool("generate_code", {
  description:
    "Generate a code snippet in a specified programming language. Returns the code as text that can be shared with the user.",
  parameters: {
    type: "object",
    properties: {
      language: {
        type: "string",
        description: "Programming language (e.g. typescript, python, go, rust)",
      },
      description: {
        type: "string",
        description: "Description of what the code should do",
      },
    },
    required: ["language", "description"],
  },
  handler: async (args: { language: string; description: string }) => {
    // The actual code generation is handled by Copilot's LLM via the prompt.
    // This tool is a signal to the LLM to format its response as code.
    return {
      instruction: `Generate a ${args.language} code snippet that: ${args.description}. Return ONLY the code in a fenced code block.`,
      language: args.language,
    };
  },
});

export const explainCodeTool = defineTool("explain_code", {
  description:
    "Explain a piece of code. The user can paste code and this tool helps understand it.",
  parameters: {
    type: "object",
    properties: {
      code: { type: "string", description: "The code to explain" },
      language: {
        type: "string",
        description: "Programming language of the code (optional)",
      },
    },
    required: ["code"],
  },
  handler: async (args: { code: string; language?: string }) => {
    return {
      instruction: `Explain this ${args.language ?? ""} code step by step:\n\`\`\`${args.language ?? ""}\n${args.code}\n\`\`\``,
      code: args.code,
    };
  },
});

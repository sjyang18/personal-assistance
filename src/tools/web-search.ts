import { defineTool } from "@github/copilot-sdk";

export const webSearchTool = defineTool("web_search", {
  description:
    "Search the web for current information. Use this when the user asks about recent events, news, or anything requiring up-to-date data.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query",
      },
    },
    required: ["query"],
  },
  handler: async (args: { query: string }) => {
    try {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(args.query)}`;
      const resp = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; PersonalAssistant/1.0)",
        },
      });
      const html = await resp.text();

      // Extract result snippets from DuckDuckGo HTML
      const results: { title: string; snippet: string; url: string }[] = [];
      const regex =
        /<a rel="nofollow" class="result__a" href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
      let match;
      while ((match = regex.exec(html)) !== null && results.length < 5) {
        results.push({
          url: match[1].replace(/&amp;/g, "&"),
          title: match[2].replace(/<[^>]*>/g, "").trim(),
          snippet: match[3].replace(/<[^>]*>/g, "").trim(),
        });
      }

      if (results.length === 0) {
        return { message: "No results found", query: args.query };
      }

      return {
        query: args.query,
        results: results.map((r, i) => ({
          rank: i + 1,
          ...r,
        })),
      };
    } catch (err) {
      return {
        error: `Search failed: ${err instanceof Error ? err.message : String(err)}`,
        query: args.query,
      };
    }
  },
});

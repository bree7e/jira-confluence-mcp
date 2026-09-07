import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ConfluenceClient } from "../../client/confluence-client.js";

export function registerListSpaces(
  server: McpServer,
  client: ConfluenceClient,
): void {
  server.registerTool(
    "confluence_list_spaces",
    {
      description: "Получить список всех пространств Confluence",
      inputSchema: {},
    },
    async () => {
      try {
        const result = await client.listSpaces();

        if (result.results.length === 0) {
          return {
            content: [{ type: "text", text: "Пространства не найдены." }],
          };
        }

        const lines = result.results.map((s) => {
          return `- **${s.key}** — ${s.name} (${s.type}, ${s.status})`;
        });

        const header = `### Пространства Confluence (${result.size})`;
        return {
          content: [{ type: "text", text: [header, ...lines].join("\n") }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Ошибка получения списка пространств: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

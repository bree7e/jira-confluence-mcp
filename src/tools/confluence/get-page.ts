import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { ConfluenceClient } from "../../client/confluence-client.js";

export function registerGetPage(
  server: McpServer,
  client: ConfluenceClient,
): void {
  server.registerTool(
    "confluence_get_page",
    {
      description: "Получить содержимое страницы Confluence по её ID",
      inputSchema: {
        pageId: z.string().describe("ID страницы Confluence (числовой)"),
      },
    },
    async ({ pageId }) => {
      try {
        const page = await client.getPage(pageId, [
          "space",
          "version",
          "body.storage",
        ]);

        const body = page.body?.storage?.value || "—";

        const formatted = [
          `## ${page.title}`,
          ``,
          `| Поле | Значение |`,
          `|------|----------|`,
          `| **ID** | ${page.id} |`,
          `| **Пространство** | ${page.space?.key || "—"} |`,
          `| **Статус** | ${page.status} |`,
          `| **Версия** | ${page.version?.number ?? 1} |`,
          `| **Обновлено** | ${page.version?.when ? new Date(page.version.when).toLocaleDateString("ru-RU") : "—"} |`,
          ``,
          `### Содержимое`,
          ``,
          body,
        ].join("\n");

        return {
          content: [{ type: "text", text: formatted }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Ошибка получения страницы: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

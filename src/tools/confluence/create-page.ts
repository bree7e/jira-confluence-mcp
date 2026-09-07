import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { ConfluenceClient } from "../../client/confluence-client.js";

export function registerCreatePage(
  server: McpServer,
  client: ConfluenceClient,
): void {
  server.registerTool(
    "confluence_create_page",
    {
      description: "Создать новую страницу в Confluence (формат ADF)",
      inputSchema: {
        spaceKey: z.string().describe("Ключ пространства (например: 'PROJ')"),
        title: z.string().describe("Заголовок страницы"),
        body: z
          .string()
          .describe(
            "Содержимое страницы в формате Atlassian Document Format (JSON)",
          ),
        parentId: z
          .string()
          .optional()
          .describe("ID родительской страницы (для вложенности)"),
      },
    },
    async ({ spaceKey, title, body, parentId }) => {
      try {
        // Parse and validate ADF JSON
        let adfBody: unknown;
        try {
          adfBody = JSON.parse(body);
        } catch {
          return {
            content: [
              {
                type: "text",
                text: "Ошибка: тело страницы должно быть валидным JSON в формате ADF (Atlassian Document Format).",
              },
            ],
            isError: true,
          };
        }

        const ancestors = parentId ? [{ id: parentId }] : undefined;

        const page = await client.createPage({
          type: "page",
          title,
          space: { key: spaceKey },
          ancestors,
          body: {
            atlas_doc_format: {
              value: JSON.stringify(adfBody),
              representation: "atlas_doc_format",
            },
          },
        });

        return {
          content: [
            {
              type: "text",
              text: `✅ Страница создана: **${page.title}**\n\nID: ${page.id}\nПространство: ${page.space?.key || spaceKey}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Ошибка создания страницы: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

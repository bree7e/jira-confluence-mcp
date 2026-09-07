import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { ConfluenceClient } from "../../client/confluence-client.js";

export function registerUpdatePage(
  server: McpServer,
  client: ConfluenceClient,
): void {
  server.registerTool(
    "confluence_update_page",
    {
      description: "Обновить существующую страницу Confluence",
      inputSchema: {
        pageId: z.string().describe("ID страницы Confluence"),
        title: z.string().optional().describe("Новый заголовок страницы"),
        body: z
          .string()
          .optional()
          .describe("Новое содержимое в формате ADF (JSON)"),
      },
    },
    async ({ pageId, title, body }) => {
      try {
        // First, get current page to know version number
        const current = await client.getPage(pageId, ["version"]);

        const newVersion = (current.version?.number ?? 1) + 1;

        const updateBody: Record<string, unknown> = {
          id: pageId,
          type: "page",
          version: { number: newVersion },
        };

        if (title !== undefined) {
          updateBody.title = title;
        }

        if (body !== undefined) {
          let adfBody: unknown;
          try {
            adfBody = JSON.parse(body);
          } catch {
            return {
              content: [
                {
                  type: "text",
                  text: "Ошибка: тело страницы должно быть валидным JSON в формате ADF.",
                },
              ],
              isError: true,
            };
          }

          updateBody.body = {
            atlas_doc_format: {
              value: JSON.stringify(adfBody),
              representation: "atlas_doc_format",
            },
          };
        }

        await client.updatePage(
          updateBody as {
            id: string;
            type: "page";
            title?: string;
            body?: {
              atlas_doc_format?: {
                value: string;
                representation: "atlas_doc_format";
              };
            };
            version: { number: number };
          },
        );

        return {
          content: [
            {
              type: "text",
              text: `✅ Страница **${pageId}** обновлена (версия ${newVersion}).`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Ошибка обновления страницы: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

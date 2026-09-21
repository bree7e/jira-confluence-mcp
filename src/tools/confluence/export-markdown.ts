import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { ConfluenceClient } from "../../client/confluence-client.js";
import { getConverter } from "../../import/converters.js";
import {
  createResolver,
  preparePage,
  renderPage,
} from "../../import/export-page.js";
import { saveImport } from "../../import/importer.js";

export function registerExportMarkdown(
  server: McpServer,
  client: ConfluenceClient,
): void {
  server.registerTool(
    "confluence_export_markdown",
    {
      description:
        "Экспорт страницы Confluence в Markdown с YAML-метаданными. Без outputDirectory возвращает текст; с каталогом безопасно создаёт или обновляет локальный импорт.",
      inputSchema: {
        pageId: z.string().regex(/^\d+$/),
        converter: z
          .enum(["remark"])
          .default("remark")
          .describe("Сменный движок преобразования"),
        outputDirectory: z
          .string()
          .optional()
          .describe("Локальный каталог импорта на машине MCP-сервера"),
      },
    },
    async ({ pageId, converter, outputDirectory }) => {
      try {
        const page = await client.getPage(pageId, [
          "space",
          "version",
          "body.storage",
        ]);
        const prepared = await preparePage(
          page,
          createResolver(client, client.sourceBaseUrl, process.env.JIRA_URL),
        );
        const result = await renderPage(prepared, getConverter(converter));
        if (outputDirectory !== undefined) {
          if (!outputDirectory.trim())
            throw new Error("outputDirectory cannot be empty");
          const report = await saveImport(result, outputDirectory);
          return {
            content: [
              { type: "text" as const, text: JSON.stringify(report, null, 2) },
            ],
            isError: report.status === "conflict",
          };
        }
        return {
          content: [
            { type: "text" as const, text: result.markdown },
            {
              type: "text" as const,
              text: JSON.stringify({
                warnings: result.warnings,
                linkedPageIds: result.linkedPageIds,
              }),
            },
          ],
        };
      } catch (error) {
        const message = (error as Error).message;
        return {
          content: [
            {
              type: "text" as const,
              text: message.startsWith("HTTP ")
                ? message.split(":")[0]
                : message,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

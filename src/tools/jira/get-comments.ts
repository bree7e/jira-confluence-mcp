import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { JiraClient } from "../../client/jira-client.js";

export function registerGetComments(
  server: McpServer,
  client: JiraClient,
): void {
  server.registerTool(
    "jira_get_comments",
    {
      description: "Получить список комментариев к задаче Jira",
      inputSchema: {
        issueKey: z.string().describe("Ключ задачи (например: 'PROJ-123')"),
      },
    },
    async ({ issueKey }) => {
      try {
        const result = await client.getComments(issueKey);

        if (result.comments.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `У задачи **${issueKey}** нет комментариев.`,
              },
            ],
          };
        }

        const lines = result.comments.map((c, i) => {
          const bodyText =
            typeof c.body === "object" && c.body !== null
              ? JSON.stringify(c.body, null, 2)
              : String(c.body ?? "");
          return [
            `### Комментарий ${i + 1}`,
            `**Автор:** ${c.author.displayName}`,
            `**Дата:** ${c.created}`,
            ``,
            bodyText,
          ].join("\n");
        });

        const header = `### Комментарии к задаче **${issueKey}** (${result.total})`;
        return {
          content: [
            { type: "text", text: [header, ...lines].join("\n\n---\n\n") },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Ошибка получения комментариев: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

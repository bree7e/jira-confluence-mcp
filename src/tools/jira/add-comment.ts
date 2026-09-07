import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { JiraClient } from "../../client/jira-client.js";

export function registerAddComment(
  server: McpServer,
  client: JiraClient,
): void {
  server.registerTool(
    "jira_add_comment",
    {
      description: "Добавить комментарий к задаче Jira",
      inputSchema: {
        issueKey: z.string().describe("Ключ задачи (например: 'PROJ-123')"),
        body: z.string().describe("Текст комментария"),
      },
    },
    async ({ issueKey, body }) => {
      try {
        const comment = await client.addComment(issueKey, body);

        return {
          content: [
            {
              type: "text",
              text: `✅ Комментарий добавлен к задаче **${issueKey}**\n\nАвтор: ${comment.author.displayName}\nСоздан: ${comment.created}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Ошибка добавления комментария: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

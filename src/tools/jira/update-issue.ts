import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { JiraClient } from "../../client/jira-client.js";

export function registerUpdateIssue(
  server: McpServer,
  client: JiraClient,
): void {
  server.registerTool(
    "jira_update_issue",
    {
      description: "Обновить существующую задачу в Jira",
      inputSchema: {
        issueKey: z.string().describe("Ключ задачи (например: 'PROJ-123')"),
        summary: z.string().optional().describe("Новый заголовок задачи"),
        description: z.string().optional().describe("Новое описание задачи"),
        priority: z
          .string()
          .optional()
          .describe("Новый приоритет (например: 'High', 'Medium', 'Low')"),
      },
    },
    async ({ issueKey, summary, description, priority }) => {
      try {
        const fields: Record<string, unknown> = {};
        if (summary !== undefined) fields.summary = summary;
        if (description !== undefined) fields.description = description;
        if (priority !== undefined) fields.priority = { name: priority };

        if (Object.keys(fields).length === 0) {
          return {
            content: [{ type: "text", text: "Нет полей для обновления." }],
          };
        }

        await client.updateIssue(
          issueKey,
          fields as {
            summary?: string;
            description?: string;
            priority?: { name: string };
          },
        );

        return {
          content: [
            {
              type: "text",
              text: `✅ Задача **${issueKey}** успешно обновлена.`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Ошибка обновления задачи: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

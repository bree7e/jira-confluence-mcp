import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { JiraClient } from "../../client/jira-client.js";

export function registerCreateIssue(
  server: McpServer,
  client: JiraClient,
): void {
  server.registerTool(
    "jira_create_issue",
    {
      description: "Создать новую задачу в Jira",
      inputSchema: {
        projectKey: z.string().describe("Ключ проекта (например: 'PROJ')"),
        summary: z.string().describe("Заголовок задачи"),
        description: z
          .string()
          .optional()
          .describe("Описание задачи в текстовом формате"),
        issueType: z
          .string()
          .optional()
          .default("Task")
          .describe("Тип задачи (например: 'Task', 'Bug', 'Story')"),
        priority: z
          .string()
          .optional()
          .describe("Приоритет (например: 'High', 'Medium', 'Low')"),
      },
    },
    async ({ projectKey, summary, description, issueType, priority }) => {
      try {
        const fields: Record<string, unknown> = {
          project: { key: projectKey },
          summary,
          issuetype: { name: issueType },
        };

        if (description) {
          fields.description = description;
        }

        if (priority) {
          fields.priority = { name: priority };
        }

        const issue = await client.createIssue(
          fields as {
            project: { key: string };
            summary: string;
            description?: string;
            issuetype?: { name: string };
            priority?: { name: string };
          },
        );

        return {
          content: [
            {
              type: "text",
              text: `✅ Задача создана: **${issue.key}**\n\nПросмотр: ${issue.self}\n\nЗаголовок: ${summary}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Ошибка создания задачи: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

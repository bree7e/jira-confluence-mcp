import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { JiraClient } from "../../client/jira-client.js";

export function registerSearchIssues(
  server: McpServer,
  client: JiraClient,
): void {
  server.registerTool(
    "jira_search_issues",
    {
      description: "Поиск задач Jira по JQL-запросу",
      inputSchema: {
        jql: z
          .string()
          .describe(
            "JQL-запрос для поиска (например: 'project = PROJ AND status = \"In Progress\"')",
          ),
        maxResults: z
          .number()
          .optional()
          .default(25)
          .describe("Максимальное количество результатов (по умолчанию 25)"),
        startAt: z
          .number()
          .optional()
          .default(0)
          .describe("Смещение для пагинации"),
      },
    },
    async ({ jql, maxResults, startAt }) => {
      try {
        const result = await client.searchIssues({
          jql,
          maxResults,
          startAt,
          fields: [
            "summary",
            "status",
            "priority",
            "assignee",
            "issuetype",
            "created",
            "updated",
          ],
        });

        if (result.issues.length === 0) {
          return {
            content: [{ type: "text", text: "Задачи не найдены." }],
          };
        }

        const lines = result.issues.map((issue) => {
          const fields = issue.fields as Record<string, unknown>;
          const summary = (fields.summary as string) || "—";
          const status =
            ((fields.status as Record<string, unknown>)?.name as string) || "—";
          const priority =
            ((fields.priority as Record<string, unknown>)?.name as string) ||
            "—";
          const assignee = (fields.assignee as Record<string, unknown>)
            ?.displayName as string;
          const assigneeStr = assignee ? `@${assignee}` : "не назначен";
          const type =
            ((fields.issuetype as Record<string, unknown>)?.name as string) ||
            "—";

          return `- **[${issue.key}]** ${summary} | ${type} | ${status} | ${priority} | ${assigneeStr}`;
        });

        const header = `Найдено задач: ${result.total} (показано ${result.issues.length})`;
        return {
          content: [{ type: "text", text: [header, ...lines].join("\n") }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Ошибка поиска задач: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

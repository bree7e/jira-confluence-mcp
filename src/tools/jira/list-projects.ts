import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { JiraClient } from "../../client/jira-client.js";

export function registerListProjects(
  server: McpServer,
  client: JiraClient,
): void {
  server.registerTool(
    "jira_list_projects",
    { description: "Получить список всех проектов Jira", inputSchema: {} },
    async () => {
      try {
        const projects = await client.listProjects();

        if (projects.length === 0) {
          return {
            content: [{ type: "text", text: "Проекты не найдены." }],
          };
        }

        const lines = projects.map((p) => {
          return `- **${p.key}** — ${p.name} (${p.projectTypeKey})`;
        });

        const header = `### Проекты Jira (${projects.length})`;
        return {
          content: [{ type: "text", text: [header, ...lines].join("\n") }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Ошибка получения списка проектов: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

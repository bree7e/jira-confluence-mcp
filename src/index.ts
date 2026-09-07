#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { JiraClient } from "./client/jira-client.js";
import { ConfluenceClient } from "./client/confluence-client.js";
import { registerJiraTools } from "./tools/jira/index.js";
import { registerConfluenceTools } from "./tools/confluence/index.js";

async function main(): Promise<void> {
  const config = loadConfig();

  const server = new McpServer({
    name: "atlassian-mcp-server",
    version: "0.1.0",
    description:
      "MCP-сервер для взаимодействия с Jira и Confluence (Server/Data Center) через REST API",
  });

  // Инициализация клиентов
  const jiraClient = new JiraClient(
    config.jira.url,
    config.jira.username,
    config.jira.apiToken,
  );
  const confluenceClient = new ConfluenceClient(
    config.confluence.url,
    config.confluence.username,
    config.confluence.apiToken,
  );

  // Регистрация tools
  registerJiraTools(server, jiraClient);
  registerConfluenceTools(server, confluenceClient, jiraClient);

  // Подключение через stdio транспорт
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error starting MCP server:", error);
  process.exit(1);
});

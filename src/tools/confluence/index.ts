import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ConfluenceClient } from "../../client/confluence-client.js";
import { registerSearchPages } from "./search-pages.js";
import { registerGetPage } from "./get-page.js";
import { registerCreatePage } from "./create-page.js";
import { registerUpdatePage } from "./update-page.js";
import { registerListSpaces } from "./list-spaces.js";
import { registerFindPagesForIssue } from "./find-pages-for-issue.js";
import type { JiraClient } from "../../client/jira-client.js";

export function registerConfluenceTools(
  server: McpServer,
  client: ConfluenceClient,
  jiraClient: JiraClient,
): void {
  registerSearchPages(server, client);
  registerGetPage(server, client);
  registerCreatePage(server, client);
  registerUpdatePage(server, client);
  registerListSpaces(server, client);
  registerFindPagesForIssue(server, jiraClient, client);
}

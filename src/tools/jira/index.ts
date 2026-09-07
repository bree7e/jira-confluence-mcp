import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { JiraClient } from "../../client/jira-client.js";
import { registerSearchIssues } from "./search-issues.js";
import { registerGetIssue } from "./get-issue.js";
import { registerCreateIssue } from "./create-issue.js";
import { registerUpdateIssue } from "./update-issue.js";
import { registerListProjects } from "./list-projects.js";
import { registerAddComment } from "./add-comment.js";
import { registerGetComments } from "./get-comments.js";

export function registerJiraTools(server: McpServer, client: JiraClient): void {
  registerSearchIssues(server, client);
  registerGetIssue(server, client);
  registerCreateIssue(server, client);
  registerUpdateIssue(server, client);
  registerListProjects(server, client);
  registerAddComment(server, client);
  registerGetComments(server, client);
}

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { JiraClient } from "../../client/jira-client.js";
import type { JiraIssueLink, JiraIssueReference } from "../../types/jira.js";

function issueReference(value: unknown): JiraIssueReference | undefined {
  if (!value || typeof value !== "object") return undefined;
  const issue = value as Record<string, unknown>;
  if (typeof issue.key !== "string") return undefined;
  const fields = (issue.fields || {}) as Record<string, unknown>;
  return {
    id: typeof issue.id === "string" ? issue.id : undefined,
    key: issue.key,
    self: typeof issue.self === "string" ? issue.self : undefined,
    summary: typeof fields.summary === "string" ? fields.summary : undefined,
    issueType:
      ((fields.issuetype as Record<string, unknown>)?.name as string) ||
      undefined,
    status:
      ((fields.status as Record<string, unknown>)?.name as string) || undefined,
  };
}

function namedLink(value: unknown): JiraIssueReference | undefined {
  if (typeof value === "string") return { key: value };
  return issueReference(value);
}

export function registerGetIssue(server: McpServer, client: JiraClient): void {
  server.registerTool(
    "jira_get_issue",
    {
      description:
        "Get Jira issue details including parent, subtasks, issue links and remote links",
      inputSchema: {
        issueKey: z.string().describe("Issue key, for example PROJ-123"),
      },
    },
    async ({ issueKey }) => {
      try {
        const [issue, remoteLinks, fieldDefinitions] = await Promise.all([
          client.getIssue(issueKey),
          client.getRemoteLinks(issueKey).catch(() => []),
          client.getFields().catch(() => []),
        ]);
        const f = issue.fields as Record<string, unknown>;
        const text = (name: string, fallback = "") =>
          typeof f[name] === "string" ? (f[name] as string) : fallback;
        const objectName = (name: string, fallback = "") =>
          ((f[name] as Record<string, unknown>)?.name as string) || fallback;
        const displayName = (name: string, fallback = "") =>
          ((f[name] as Record<string, unknown>)?.displayName as string) ||
          fallback;
        const issueLinks: JiraIssueLink[] = (
          (f.issuelinks as unknown[]) || []
        ).flatMap((raw) => {
          const link = raw as Record<string, unknown>;
          const linkType = (link.type || {}) as Record<string, unknown>;
          const inward = issueReference(link.inwardIssue);
          const outward = issueReference(link.outwardIssue);
          const linkedIssue = inward || outward;
          if (!linkedIssue) return [];
          return [
            {
              id: String(link.id || ""),
              type: {
                id: typeof linkType.id === "string" ? linkType.id : undefined,
                name: String(linkType.name || ""),
                inward:
                  typeof linkType.inward === "string"
                    ? linkType.inward
                    : undefined,
                outward:
                  typeof linkType.outward === "string"
                    ? linkType.outward
                    : undefined,
              },
              direction: inward ? ("inward" as const) : ("outward" as const),
              issue: linkedIssue,
            },
          ];
        });
        const customFieldId = (name: string) =>
          fieldDefinitions.find(
            (field) => field.name.toLowerCase() === name.toLowerCase(),
          )?.id;
        const epicFieldId = customFieldId("Epic Link");
        const parentLinkFieldId = customFieldId("Parent Link");
        const data = {
          id: issue.id,
          key: issue.key,
          self: issue.self,
          summary: text("summary"),
          description: text("description"),
          type: objectName("issuetype"),
          status: objectName("status"),
          priority: objectName("priority"),
          assignee: displayName("assignee"),
          reporter: displayName("reporter"),
          created: text("created"),
          updated: text("updated"),
          parent: issueReference(f.parent),
          subtasks: ((f.subtasks as unknown[]) || [])
            .map(issueReference)
            .filter(Boolean),
          issueLinks,
          remoteLinks,
          epic: epicFieldId ? namedLink(f[epicFieldId]) : undefined,
          parentLink: parentLinkFieldId
            ? namedLink(f[parentLinkFieldId])
            : undefined,
          confluenceLinks: remoteLinks.filter((link) =>
            /confluence|\/wiki\//i.test(
              `${link.application?.type || ""} ${link.application?.name || ""} ${link.object.url}`,
            ),
          ),
        };
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to get issue: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { JiraClient } from "../../client/jira-client.js";
import type { ConfluenceClient } from "../../client/confluence-client.js";
import type { ConfluencePage } from "../../types/confluence.js";

function escapeCql(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function pageIdFromUrl(url: string): string | null {
  return (
    url.match(/[?&]pageId=(\d+)/i)?.[1] ||
    url.match(/\/pages\/(\d+)(?:\/|$)/i)?.[1] ||
    null
  );
}

export function registerFindPagesForIssue(
  server: McpServer,
  jira: JiraClient,
  confluence: ConfluenceClient,
): void {
  server.registerTool(
    "confluence_find_pages_for_issue",
    {
      description:
        "Find Confluence pages for a Jira issue using remote links, then CQL title search",
      inputSchema: {
        issueKey: z.string().describe("Jira issue key, for example IDPPA-7616"),
        spaceKey: z.string().optional().default("ZPA"),
        limit: z.number().int().min(1).max(100).optional().default(25),
      },
    },
    async ({ issueKey, spaceKey, limit }) => {
      try {
        const [issue, remoteLinks] = await Promise.all([
          jira.getIssue(issueKey, ["summary"]),
          jira.getRemoteLinks(issueKey).catch(() => []),
        ]);
        const directPages = remoteLinks
          .filter((link) =>
            /confluence|\/wiki\//i.test(
              `${link.application?.type || ""} ${link.application?.name || ""} ${link.object.url}`,
            ),
          )
          .map((link) => ({
            id: pageIdFromUrl(link.object.url),
            title: link.object.title,
            spaceKey: null,
            url: link.object.url,
            source: "jira-remote-link",
          }));
        if (directPages.length > 0) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ issueKey, pages: directPages }, null, 2),
              },
            ],
          };
        }
        const summary = String(issue.fields.summary || "").trim();
        const issueNumber = issueKey.match(/-(\d+)$/)?.[1];
        const terms = [
          issueNumber ? `(${issueNumber})` : "",
          issueKey,
          summary,
        ].filter(
          (value, index, values) => value && values.indexOf(value) === index,
        );
        const searches = await Promise.all(
          terms.map((term) =>
            confluence.searchContent({
              cql: `space="${escapeCql(spaceKey)}" AND title~"${escapeCql(term)}"`,
              limit,
              start: 0,
              expand: ["space", "version"],
            }),
          ),
        );
        const unique = new Map<string, ConfluencePage>();
        for (const result of searches) {
          for (const page of result.results) unique.set(page.id, page);
        }
        const pages = [...unique.values()].map((page) => ({
          id: page.id,
          title: page.title,
          spaceKey: page.space?.key || spaceKey,
          url: confluence.getPageUrl(page),
          version: page.version?.number ?? 1,
          updatedAt: page.version?.when || "",
          source: "cql-title-search",
        }));
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { issueKey, searchedTerms: terms, pages },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Related page search failed: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

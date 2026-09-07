import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { ConfluenceClient } from "../../client/confluence-client.js";

export function registerSearchPages(
  server: McpServer,
  client: ConfluenceClient,
): void {
  server.registerTool(
    "confluence_search_pages",
    {
      description:
        "Search Confluence pages with CQL and return page IDs and URLs",
      inputSchema: {
        cql: z.string().describe("CQL query"),
        limit: z.number().int().min(1).max(100).optional().default(25),
        start: z.number().int().min(0).optional().default(0),
      },
    },
    async ({ cql, limit, start }) => {
      try {
        const result = await client.searchContent({
          cql,
          limit,
          start,
          expand: ["space", "version"],
        });
        const pages = result.results.map((page) => ({
          id: page.id,
          title: page.title,
          spaceKey: page.space?.key || "",
          url: client.getPageUrl(page),
          version: page.version?.number ?? 1,
          updatedAt: page.version?.when || "",
        }));
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  total: result.size,
                  start: result.start,
                  limit: result.limit,
                  pages,
                },
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
              text: `Page search failed: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

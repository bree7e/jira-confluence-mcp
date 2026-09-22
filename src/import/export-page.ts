import { restoreTableReferences } from "./tables.js";
import type { ConfluenceClient } from "../client/confluence-client.js";
import type { ConfluencePage } from "../types/confluence.js";
import type { MarkdownConverter } from "./converters.js";
import { normalize, type SourceResolver } from "./normalize.js";

export const FORMAT_VERSION = "4";

export function parseModules(value: string): string[] {
  const modules = value.split(",").map((module) => module.trim());
  if (modules.some((module) => !/^[a-z][a-z0-9_-]*$/.test(module)))
    throw new Error("Invalid modules: use comma-separated lowercase module codes");
  return [...new Set(modules)];
}
export interface ExportResult {
  markdown: string;
  pageId: string;
  version: number;
  source: string;
  converter: string;
  converterVersion: string;
  warnings: string[];
  linkedPageIds: string[];
}

export function createResolver(
  client: ConfluenceClient,
  baseUrl: string,
  jiraUrl?: string,
): SourceResolver {
  const pages = new Map<string, Promise<string>>();
  const attachments = new Map<string, Promise<string>>();
  const users = new Map<string, Promise<{ username: string; displayName?: string }>>();
  return {
    pageUrl: (id) =>
      baseUrl.replace(/\/+$/, "") +
      "/pages/viewpage.action?pageId=" +
      encodeURIComponent(id),
    userUrl: (username) =>
      baseUrl.replace(/\/+$/, "") +
      "/display/~" + encodeURIComponent(username).replace(/%40/gi, "@"),
    resolveUser(key) {
      if (!users.has(key)) users.set(key, client.getUserByKey(key));
      return users.get(key)!;
    },
    absoluteUrl: (value) => client.resolveUrl(value),
    findPage(title, space) {
      const key = JSON.stringify([space, title]);
      if (!pages.has(key))
        pages.set(
          key,
          client.findPageByTitle(title, space).then((page) => page.id),
        );
      return pages.get(key)!;
    },
    attachment(id, filename) {
      const key = JSON.stringify([id, filename]);
      if (!attachments.has(key))
        attachments.set(key, client.getAttachmentUrl(id, filename));
      return attachments.get(key)!;
    },
    jiraUrl(key, jql) {
      const base = (jiraUrl || new URL(baseUrl).origin).replace(/\/+$/, "");
      return key
        ? base + "/browse/" + encodeURIComponent(key)
        : base + "/issues/?jql=" + encodeURIComponent(jql || "");
    },
  };
}

export async function preparePage(
  page: ConfluencePage,
  resolver: SourceResolver,
) {
  if (
    !/^\d+$/.test(page.id) ||
    !page.title ||
    !page.space?.key ||
    !Number.isInteger(page.version?.number) ||
    !page.version?.when ||
    typeof page.body?.storage?.value !== "string"
  ) {
    throw new Error(
      "Incomplete page: id, title, space, version, timestamp and body.storage are required",
    );
  }
  if (
    !/^\d{4}-\d{2}-\d{2}T/.test(page.version.when) ||
    !Number.isFinite(Date.parse(page.version.when))
  ) {
    throw new Error("Invalid Confluence version timestamp");
  }
  return {
    page,
    source: resolver.pageUrl(page.id),
    ...(await normalize(page, resolver)),
  };
}

export async function renderPage(
  prepared: Awaited<ReturnType<typeof preparePage>>,
  converter: MarkdownConverter,
  modules: string[] = [],
): Promise<ExportResult> {
  const { page, source } = prepared;
  const quote = (value: string) => JSON.stringify(value); // JSON strings are valid YAML scalars.
  const metadata = [
    "---",
    "title: " + quote(page.title),
    "source: " + quote(source),
    "page_id: " + quote(page.id),
    "space: " + quote(page.space!.key),
    "version: " + page.version!.number,
    "updated: " + quote(page.version!.when.slice(0, 10)),
    ...(modules.length ? ["modules: " + JSON.stringify(modules)] : []),
    "---",
  ].join("\n");
  const escapedTitle = page.title
    .replace(/\s+/g, " ")
    .replace(/([\\`*_[\]<>])/g, "\\$1");
  const converted = await converter.convert(prepared.html);
  const body = restoreTableReferences(converted, prepared.tableReplacements).trim();
  return {
    markdown: metadata + "\n\n# " + escapedTitle + "\n\n" + body + "\n",
    pageId: page.id,
    version: page.version!.number,
    source,
    converter: converter.id,
    converterVersion: converter.version + ":" + FORMAT_VERSION,
    warnings: prepared.warnings,
    linkedPageIds: prepared.links,
  };
}

#!/usr/bin/env node
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { ConfluenceClient } from "./client/confluence-client.js";
import { getConverter } from "./import/converters.js";
import {
  createResolver,
  preparePage,
  renderPage,
} from "./import/export-page.js";
import { saveImport } from "./import/importer.js";
import type { ConfluencePage } from "./types/confluence.js";

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: "string", default: "imports" },
      converter: { type: "string", default: "remark" },
      fixture: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    console.log(
      "node --env-file=.env dist/import-confluence.js <pageId> [pageId...] [--out imports] [--converter remark]\n" +
        "Offline: node dist/import-confluence.js --fixture test/fixtures/page.json --out samples\n" +
        "CLI requires CONFLUENCE_URL and CONFLUENCE_API_TOKEN (no Jira credentials).",
    );
    return;
  }
  if (
    (!positionals.length && !values.fixture) ||
    (positionals.length && values.fixture)
  ) {
    throw new Error(
      "Provide numeric page IDs OR --fixture file.json. Use --help.",
    );
  }
  for (const id of positionals)
    if (!/^\d+$/.test(id)) throw new Error("Invalid page ID: " + id);
  const converter = getConverter(values.converter);
  const base = (
    process.env.CONFLUENCE_URL ||
    (values.fixture ? "https://confluence.example.com/wiki" : "")
  ).replace(/\/+$/, "");
  if (!base || (!values.fixture && !process.env.CONFLUENCE_API_TOKEN))
    throw new Error("CONFLUENCE_URL and CONFLUENCE_API_TOKEN are required");
  const client = new ConfluenceClient(
    base,
    process.env.CONFLUENCE_USERNAME || "",
    process.env.CONFLUENCE_API_TOKEN || "",
  );
  const resolver = createResolver(client, base, process.env.JIRA_URL);
  if (values.fixture) {
    resolver.findPage = async () => {
      throw new Error("Offline fixture: page resolution unavailable");
    };
    resolver.attachment = async () => {
      throw new Error("Offline fixture: attachment resolution unavailable");
    };
  }
  const pages: (string | ConfluencePage)[] = values.fixture
    ? [JSON.parse(await readFile(values.fixture, "utf8")) as ConfluencePage]
    : positionals;
  const reports: unknown[] = [];
  for (const input of pages) {
    const id = typeof input === "string" ? input : input.id;
    try {
      const page =
        typeof input === "string"
          ? await client.getPage(input, ["space", "version", "body.storage"])
          : input;
      const prepared = await preparePage(page, resolver);
      const result = await renderPage(prepared, converter);
      const report = await saveImport(result, values.out);
      reports.push({ converter: converter.id, ...report });
      if (report.status === "conflict") process.exitCode = 1;
    } catch (error) {
      // Do not echo server response bodies: they may include sensitive source content.
      const message = (error as Error).message;
      reports.push({
        pageId: id,
        converter: converter.id,
        status: "error",
        message: message.startsWith("HTTP ") ? message.split(":")[0] : message,
      });
      process.exitCode = 1;
    }
  }
  console.log(
    JSON.stringify({ output: resolve(values.out), reports }, null, 2),
  );
}
main().catch((error) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});

import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { registerExportMarkdown } from "../dist/tools/confluence/export-markdown.js";
const run = promisify(execFile);
const fixture = JSON.parse(await readFile(new URL("./fixtures/page.json", import.meta.url), "utf8"));

test("CLI compare, repeat and HTTP 404 preserve imports; no Jira credentials needed", async () => {
  const dir = await mkdtemp(join(tmpdir(), "confluence-cli-"));
  let missing = false, requests = 0;
  const server = createServer((req, res) => {
    requests++;
    assert.equal(req.headers.authorization, "Bearer test-token");
    assert.match(req.url, /^\/wiki\/rest\/api\/content\/123\?expand=/);
    res.setHeader("Content-Type", "application/json");
    res.statusCode = missing ? 404 : 200;
    res.end(JSON.stringify(missing ? { message: "not available" } : fixture));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port + "/wiki";
  const options = { env: { CONFLUENCE_URL: base, CONFLUENCE_API_TOKEN: "test-token" }, timeout: 20000 };
  const args = [resolve("dist/import-confluence.js"), "123", "--compare", "--out", dir];
  try {
    const first = JSON.parse((await run(process.execPath, args, options)).stdout);
    assert.deepEqual(first.reports.map(r => r.status), ["created", "created"]);
    assert.equal(requests, 1, "same fetched page is used by both engines");
    const second = JSON.parse((await run(process.execPath, args, options)).stdout);
    assert.deepEqual(second.reports.map(r => r.status), ["unchanged", "unchanged"]);
    const path = join(dir, "remark", "123.md"), before = await readFile(path, "utf8");
    missing = true;
    await assert.rejects(run(process.execPath, args, options), error => {
      assert.equal(error.code, 1);
      assert.equal(JSON.parse(error.stdout).reports[0].status, "error");
      return true;
    });
    assert.equal(await readFile(path, "utf8"), before);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});

test("MCP text export and disk import share the same implementation", async () => {
  let handler;
  const server = { registerTool(name, config, callback) {
    assert.equal(name, "confluence_export_markdown");
    handler = callback;
  } };
  const client = { sourceBaseUrl: "https://example.com/wiki", getPage: async () => fixture,
    resolveUrl: url => new URL(url, "https://example.com/wiki/").href };
  registerExportMarkdown(server, client);
  const response = await handler({ pageId: "123", converter: "remark" });
  assert.notEqual(response.isError, true);
  assert.match(response.content[0].text, /^---/);
  const dir = await mkdtemp(join(tmpdir(), "confluence-mcp-"));
  try {
    const imported = await handler({ pageId: "123", converter: "remark", outputDirectory: dir });
    assert.equal(JSON.parse(imported.content[0].text).status, "created");
    assert.equal(await readFile(join(dir, "123.md"), "utf8"), response.content[0].text);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

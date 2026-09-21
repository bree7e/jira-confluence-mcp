import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  writeFile,
  rm,
  stat,
  mkdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { converters } from "../dist/import/converters.js";
import {
  preparePage,
  renderPage,
  createResolver,
} from "../dist/import/export-page.js";
import { saveImport } from "../dist/import/importer.js";
import { ConfluenceClient } from "../dist/client/confluence-client.js";

const fixture = JSON.parse(
  await readFile(new URL("./fixtures/page.json", import.meta.url), "utf8"),
);
const resolver = {
  pageUrl: (id) =>
    "https://example.com/wiki/pages/viewpage.action?pageId=" + id,
  absoluteUrl: (url) => new URL(url, "https://example.com/wiki/").href,
  findPage: async () => "456",
  attachment: async (id, name) =>
    "https://example.com/wiki/download/attachments/" +
    id +
    "/" +
    encodeURIComponent(name),
  jiraUrl: (key) => "https://example.com/browse/" + key,
};
for (const converter of Object.values(converters)) {
  test(
    converter.id + ": structure, links, complex tables, macros and metadata",
    async () => {
      const result = await renderPage(
        await preparePage(fixture, resolver),
        converter,
      );
      const md = result.markdown;
      assert.match(md, /^---\ntitle: "Тест: /);
      assert.match(md, /page_id: "123"/);
      assert.match(md, /updated: "2026-09-09"/);
      assert.equal(md.match(/^# /gm)?.length, 1);
      assert.match(md, /^## Требования$/m);
      assert.match(md, /^### Списки$/m);
      assert.match(md, /^3\.\s+Третий/m);
      assert.match(md, /~~устарело~~/);
      assert.match(md, /const x = "<tag>";/);
      assert.match(md, /Не потерять этот текст/);
      assert.match(
        md,
        /\[Изображение[^\]]*\]\(https:\/\/example.com\/original.png\)/,
      );
      assert.doesNotMatch(md, /!\[/);
      assert.match(
        md,
        /https:\/\/example.com\/wiki\/pages\/viewpage.action\?pageId=456/,
      );
      assert.match(md, /<a id="table-2-r2-c2"><\/a>/);
      assert.match(md, /\(#table-2-r2-c2\)/);
      assert.match(md, /Подшаг/);
      assert.match(md, /Абзац 1/);
      assert.match(md, /Абзац 2/);
      assert.doesNotMatch(md, /CFANCHOR|<ac:|<ri:/);
      assert.ok(result.warnings.some((w) => w.includes("unknown")));
      assert.ok(result.warnings.some((w) => w.includes("merged")));
      assert.ok(result.linkedPageIds.includes("456"));
      // A line break inside a simple cell must not split a Markdown table row.
      const row = md.split("\n").find((line) => line.includes("Один"));
      assert.ok(row.startsWith("|") && row.endsWith("|"), row);
      assert.ok(row.includes("Два"), row);
    },
  );

  test(
    converter.id +
      ": attachment resolution and unavailable resources are visible",
    async () => {
      const page = structuredClone(fixture);
      page.body.storage.value =
        '<p><ac:image><ri:attachment ri:filename="a b.png"><ri:page ri:content-id="789"/></ri:attachment></ac:image></p>';
      const result = await renderPage(
        await preparePage(page, resolver),
        converter,
      );
      assert.match(result.markdown, /attachments\/789\/a%20b.png/);
      const failed = await renderPage(
        await preparePage(page, {
          ...resolver,
          attachment: async () => {
            throw new Error("404");
          },
        }),
        converter,
      );
      assert.match(failed.markdown, /Изображение недоступно/);
      assert.equal(failed.warnings.length, 1);
    },
  );
}

test("incremental import, converter change, local conflict and source isolation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "confluence-import-"));
  try {
    const prepared = await preparePage(fixture, resolver);
    const result = await renderPage(prepared, converters.remark);
    const first = await saveImport(result, dir);
    assert.equal(first.status, "created");
    const before = (await stat(first.path)).mtimeMs;
    assert.equal((await saveImport(result, dir)).status, "unchanged");
    assert.equal((await stat(first.path)).mtimeMs, before);
    assert.equal(
      (
        await saveImport(
          {
            ...result,
            version: 3,
            markdown: result.markdown.replace("version: 2", "version: 3"),
          },
          dir,
        )
      ).status,
      "updated",
    );
    assert.equal((await saveImport(result, dir)).status, "conflict");
    assert.equal(
      (
        await saveImport(
          { ...result, version: 3, source: "https://other.example/123" },
          dir,
        )
      ).status,
      "conflict",
    );
    const replacement = {
      ...converters.remark,
      id: "replacement",
      version: "2",
    };
    const switched = await renderPage(prepared, replacement);
    switched.version = 3;
    assert.equal((await saveImport(switched, dir)).status, "updated");
    await writeFile(first.path, "Личная правка");
    assert.equal((await saveImport(switched, dir)).status, "conflict");
    assert.equal(await readFile(first.path, "utf8"), "Личная правка");
    await mkdir(join(dir, ".import-lock"));
    await assert.rejects(saveImport(switched, dir), /locked/);
    await rm(join(dir, ".import-lock"), { recursive: true });
    await assert.rejects(
      saveImport({ ...switched, pageId: "../escape" }, dir),
      /Invalid page/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("incomplete source rejected; relative attachment links preserve context", async () => {
  await assert.rejects(
    preparePage({ ...fixture, version: undefined }, resolver),
    /Incomplete page/,
  );
  const client = new ConfluenceClient("https://example.com/wiki", "", "");
  assert.equal(
    client.resolveUrl("/download/attachments/1/x.png", true),
    "https://example.com/wiki/download/attachments/1/x.png",
  );
  assert.equal(
    client.resolveUrl("/wiki/download/attachments/1/x.png"),
    "https://example.com/wiki/download/attachments/1/x.png",
  );
  const actualResolver = createResolver(client, client.sourceBaseUrl);
  assert.equal(actualResolver.pageUrl("123"), resolver.pageUrl("123"));
});

test("registered converters retain entities, nested table content, empty cells and pipe characters", async () => {
  const page = structuredClone(fixture);
  page.body.storage.value =
    "<h1>Тест</h1><p>до&nbsp;после &copy; &lt;ok&gt;</p><table><tr><th>A</th><th>B</th></tr><tr><td></td><td><code>a|b</code></td></tr><tr><td><table><tr><td>Внутренняя</td></tr></table></td><td>Хвост</td></tr></table>";
  for (const converter of Object.values(converters)) {
    const result = await renderPage(
      await preparePage(page, resolver),
      converter,
    );
    assert.doesNotMatch(result.markdown, /&amp;|&nbsp;|&copy;/);
    assert.match(result.markdown, /©/);
    assert.match(result.markdown, /Внутренняя/);
    assert.match(result.markdown, /Хвост/);
    assert.match(result.markdown, /a\\\|b/);
    assert.doesNotMatch(result.markdown, /CFANCHOR/);
  }
});

test("unmanaged files and corrupt manifests are never overwritten", async () => {
  const dir = await mkdtemp(join(tmpdir(), "confluence-import-"));
  try {
    const result = await renderPage(
      await preparePage(fixture, resolver),
      converters.remark,
    );
    const path = join(dir, "123.md");
    await writeFile(path, "unmanaged");
    assert.equal((await saveImport(result, dir)).status, "conflict");
    assert.equal(await readFile(path, "utf8"), "unmanaged");
    await writeFile(join(dir, ".confluence-import.json"), "{broken");
    await assert.rejects(saveImport(result, dir));
    assert.equal(await readFile(path, "utf8"), "unmanaged");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("heading normalization and original root links are independent of storage heading level", async () => {
  const page = structuredClone(fixture);
  page.body.storage.value =
    '<h3>Раздел</h3><h4>Подраздел</h4><p><a href="/browse/IDPPA-1">Задача</a></p>';
  const client = new ConfluenceClient("https://example.com/wiki/", "", "");
  for (const converter of Object.values(converters)) {
    const result = await renderPage(
      await preparePage(page, createResolver(client, client.sourceBaseUrl)),
      converter,
    );
    assert.match(result.markdown, /^## Раздел$/m);
    assert.match(result.markdown, /^### Подраздел$/m);
    assert.match(result.markdown, /\(https:\/\/example.com\/browse\/IDPPA-1\)/);
  }
});

test("empty cells preserve the number of table columns", async () => {
  const page = structuredClone(fixture);
  page.body.storage.value =
    "<table><tr><th></th><th>B</th><th>C</th></tr><tr><td></td><td>x</td><td></td></tr></table>";
  for (const converter of Object.values(converters)) {
    const result = await renderPage(
      await preparePage(page, resolver),
      converter,
    );
    const rows = result.markdown
      .split("\n")
      .filter((line) => line.startsWith("|"));
    assert.equal(rows.length, 3);
    for (const row of rows)
      assert.equal(
        row.match(/(?<!\\)\|/g).length,
        4,
        converter.id + ": " + row,
      );
  }
});

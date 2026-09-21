import { load } from "cheerio";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { preparePage, renderPage } from "../dist/import/export-page.js";
import { converters } from "../dist/import/converters.js";

const fixture = JSON.parse(await readFile(new URL("./fixtures/page.json", import.meta.url), "utf8"));
const resolver = {
  pageUrl: id => "https://example.com/wiki/pages/viewpage.action?pageId=" + id,
  absoluteUrl: url => new URL(url, "https://example.com/wiki/").href,
  findPage: async () => "456",
  attachment: async () => "https://example.com/image.png",
  jiraUrl: key => "https://example.com/browse/" + key,
};
async function render(html) {
  const page = structuredClone(fixture);
  page.body.storage.value = html;
  return renderPage(await preparePage(page, resolver), converters.remark);
}
function nodes(root, type) {
  return [...(root.type === type ? [root] : []), ...(root.children || []).flatMap(child => nodes(child, type))];
}
function value(node) { return node.children ? node.children.map(value).join("") : node.value || ""; }
function parse(md) { md = md.replace(/^---\n[\s\S]*?\n---\n/, ""); return unified().use(remarkParse).use(remarkGfm).parse(md); }
function tables(md) { return nodes(parse(md), "table"); }
function rows(table) { return table.children.map(row => row.children.map(value)); }

test("ParameterSet matches the agreed shape: blank first header, inline lists and old/new names", async () => {
  const result = await render('<table><tr><th></th><th>Свойство</th><th>Описание свойства</th><th>Тип данных</th><th>Обязательность</th><th>Требование к свойству</th></tr><tr><td>1</td><td>ID</td><td>Идентификатор набора</td><td>string(guid)</td><td>required</td><td>-</td></tr><tr><td>5</td><td>IsActive</td><td>Активность</td><td>boolean</td><td>required</td><td><ul><li>False - набор Неактивен</li><li>True - набор активен (значение по умолчанию)</li></ul></td></tr><tr><td>6</td><td><strong>(Изм. 10.06)</strong> Items[]<br/><s>CustomParameter[]</s></td><td>Параметры набора</td><td><strong>(Изм. 10.06)</strong> ParameterSetItem<br/><s>CustomParameter</s></td><td>optional</td><td>-</td></tr><tr><td></td><td></td><td></td><td></td><td></td><td></td></tr></table>');
  const parsed = tables(result.markdown);
  assert.equal(parsed.length, 1);
  const data = rows(parsed[0]);
  assert.equal(data[0][0], "");
  assert.ok(data.every(row => row.length === 6));
  assert.equal(data[2][5], "- False - набор Неактивен<br>- True - набор активен (значение по умолчанию)");
  assert.equal(data[3][1], "(Изм. 10.06) Items[]<br>CustomParameter[]");
  assert.equal(nodes(parsed[0], "delete").length, 2);
  assert.deepEqual(data.at(-1), ["", "", "", "", "", ""]);
  assert.doesNotMatch(result.markdown, /<table|^#{2,6} Таблица|CFX/m);
});

test("ParameterSetItem[i] is repeated in every rowspan row", async () => {
  const result = await render('<table><tr><th>Объект</th><th>Свойство</th><th>Значение</th></tr><tr><td rowspan="3">ParameterSetItem[i]</td><td>ID</td><td>new guid</td></tr><tr><td>Name</td><td>Имя</td></tr><tr><td>Code</td><td>Код</td></tr></table>');
  const data = rows(tables(result.markdown)[0]);
  assert.deepEqual(data.slice(1).map(row => row[0]), Array(3).fill("ParameterSetItem[i]"));
  assert.deepEqual(data.slice(1).map(row => row[1]), ["ID", "Name", "Code"]);
  assert.ok(result.warnings.some(w => w.includes("merged")));
});

test("group headers are copied with br into each child; rowspan header is not duplicated", async () => {
  const result = await render('<table><tr><th rowspan="2">Объект модели данных</th><th rowspan="2">Свойство</th><th colspan="2"><strong>Чем заполнять</strong></th></tr><tr><th>В режиме создания набора</th><th>В режиме редактирования</th></tr><tr><td>ParameterSet</td><td>ID</td><td>new guid</td><td>-</td></tr></table>');
  const data = rows(tables(result.markdown)[0]);
  assert.deepEqual(data[0], ["Объект модели данных", "Свойство", "Чем заполнять<br>В режиме создания набора", "Чем заполнять<br>В режиме редактирования"]);
  assert.equal(nodes(tables(result.markdown)[0].children[0], "strong").length, 2);
  assert.deepEqual(data[1], ["ParameterSet", "ID", "new guid", "-"]);
});

test("body colspan duplicates values and header with an empty td preserves the empty column", async () => {
  const result = await render('<table><tr><td></td><th colspan="2">Группа</th></tr><tr><td></td><th>A</th><th>B</th></tr><tr><td>1</td><td colspan="2">Общее</td></tr></table>');
  const data = rows(tables(result.markdown)[0]);
  assert.deepEqual(data[0], ["", "Группа<br>A", "Группа<br>B"]);
  assert.deepEqual(data[1], ["1", "Общее", "Общее"]);
});

test("paragraphs and nested lists become one-line cells with hierarchy and start/value numbers", async () => {
  const result = await render('<table><tr><th>Текст</th></tr><tr><td><p>Вступление</p><p>Пояснение</p><ol start="3"><li>Третий<ol><li>Подпункт</li></ol></li><li value="7">Седьмой<ul><li>Вложенный</li></ul></li></ol></td></tr></table>');
  const cell = rows(tables(result.markdown)[0])[1][0];
  assert.match(cell, /Вступление<br><br>Пояснение/);
  assert.match(cell, /3\. Третий<br>/);
  assert.match(cell, /3\.1\. Подпункт/);
  assert.match(cell, /7\. Седьмой/);
  assert.match(cell, /- Вложенный/);
  assert.doesNotMatch(result.markdown, /<ol|<ul|<li/);
  assert.equal(result.markdown.split("\n").filter(line => line.trim().startsWith("|")).length, 3);
});

test("nested QC table follows parent with Obsidian reference, no duplicate row from extraction", async () => {
  const html = '<table><tr><th>Поле</th><th>Пример</th></tr><tr><td>Код</td><td>Примеры:<table id="codes"><tr><th>Код</th><th>Наименование</th></tr><tr><td>QC_VK_001</td><td>КК. Входной контроль</td></tr><tr><td>QC_VK_002</td><td>КК. Входной контроль. АГХК, КОС</td></tr></table></td></tr></table><p>После таблиц</p>';
  const result = await render(html);
  const parsed = tables(result.markdown);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].children.length, 2);
  assert.equal(parsed[1].children.length, 3);
  const id = result.markdown.match(/^\^(table-[a-z0-9-]+)$/m)?.[1];
  assert.ok(id);
  assert.ok(result.markdown.includes("[[#^" + id + "\\|[1]]]"));
  assert.ok(rows(parsed[0])[1][1].includes("[[#^" + id + "|[1]]]"));
  assert.deepEqual(rows(parsed[1]).slice(1).map(row => row[0]), ["QC_VK_001", "QC_VK_002"]);
  assert.ok(parsed[0].position.end.line < parsed[1].position.start.line);
  assert.ok(result.markdown.indexOf("^" + id + "\n") < result.markdown.indexOf("После таблиц"));
  assert.doesNotMatch(result.markdown, /CFX|<table/);
  assert.equal((await render(html)).markdown, result.markdown);
  const changed = await render('<p>Новый абзац</p>' + html.replace("КК. Входной контроль</td>", "Изменённое значение</td>"));
  assert.ok(changed.markdown.includes("^" + id), "native ID survives content changes");
});

test("multiple nesting levels are emitted depth-first; repeated rowspan points to one child", async () => {
  const result = await render('<table><tr><th>A</th><th>B</th></tr><tr><td rowspan="2"><table><tr><th>Дочерняя</th></tr><tr><td><table><tr><th>Глубже</th></tr><tr><td>Лист</td></tr></table></td></tr></table></td><td>Первая</td></tr><tr><td><table><tr><th>Соседняя</th></tr><tr><td>Вторая</td></tr></table></td></tr></table>');
  const parsed = tables(result.markdown), data = rows(parsed[0]);
  assert.equal(parsed.length, 4);
  assert.equal(data[1][0], data[2][0]);
  assert.deepEqual(parsed.map(table => rows(table)[0][0]), ["A", "Дочерняя", "Глубже", "Соседняя"]);
  assert.equal((result.markdown.match(/^\^table-/gm) || []).length, 3);
  assert.equal((result.markdown.match(/Лист/g) || []).length, 1);
});

test("different identical nested tables get distinct IDs without swallowing siblings", async () => {
  const inner = '<table><tr><th>Код</th></tr><tr><td>X</td></tr></table>';
  const result = await render('<table><tr><th>Примеры</th></tr><tr><td>' + inner + inner + '</td></tr></table>');
  const ids = [...result.markdown.matchAll(/^\^(table-[a-z0-9-]+)$/gm)].map(m => m[1]);
  assert.equal(ids.length, 2);
  assert.equal(new Set(ids).size, 2);
  assert.equal(tables(result.markdown).length, 3);
});

test("pipes, backticks, links and formatting are escaped once by remark", async () => {
  const result = await render('<table><tr><th>A</th><th>B</th></tr><tr><td>A | B and Items[]</td><td><code>a|b</code> <code>a\\|b</code> <strong>важно</strong> <s>старое</s> <a href="https://example.com/a?x=1&amp;y=2">A | B</a></td></tr></table>');
  const parsed = tables(result.markdown)[0];
  assert.equal(parsed.children[1].children.length, 2);
  assert.equal(rows(parsed)[1][0], "A | B and Items[]");
  assert.deepEqual(nodes(parsed, "inlineCode").map(node => node.value), ["a|b"]);
  const rawCode = result.markdown.match(/<code>.*?<\/code>/)?.[0];
  assert.ok(rawCode);
  assert.equal(load(rawCode).text(), "a\\|b");
  assert.equal(nodes(parsed, "link")[0].url, "https://example.com/a?x=1&y=2");
  assert.equal(nodes(parsed, "delete").length, 1);
});

test("code blocks and headings remain in cells rather than becoming page sections", async () => {
  const result = await render('<h1>Раздел</h1><table><tr><th>Описание</th></tr><tr><td><h2>Детали</h2><pre><code>  a | b\n\n  c</code></pre></td></tr></table>');
  const parsed = parse(result.markdown);
  assert.equal(nodes(parsed, "heading").length, 2);
  assert.equal(nodes(parsed, "table").length, 1);
  assert.ok(nodes(parsed, "inlineCode").some(node => node.value === "  a | b"));
  assert.match(result.markdown, /<br>/);
});

test("rowspan zero respects row groups, invalid spans warn and oversized tables fail safely", async () => {
  const result = await render('<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td rowspan="0">Группа</td><td>1</td></tr><tr><td>2</td></tr></tbody><tbody><tr><td>Новая</td><td rowspan="-1">3</td></tr></tbody></table>');
  assert.deepEqual(rows(tables(result.markdown)[0]).slice(1), [["Группа", "1"], ["Группа", "2"], ["Новая", "3"]]);
  assert.ok(result.warnings.some(w => w.includes("invalid rowspan")));
  await assert.rejects(render('<table><tr><td colspan="999999">X</td></tr></table>'), /colspan exceeds/);
});

test("no-header properties, empty cells and long acceptance scenarios remain tables", async () => {
  const long = "Длинное описание ".repeat(30).trim();
  const result = await render('<table><tr><th>Имя</th><td>A</td></tr><tr><th>Пустое</th><td></td></tr></table><table><tr><th>Шаг</th><th>Пользователь</th><th>Система</th></tr><tr><td>1</td><td>Нажать</td><td>' + long + '</td></tr></table>');
  const parsed = tables(result.markdown);
  assert.equal(parsed.length, 2);
  assert.deepEqual(rows(parsed[0])[0], ["Поле", "Значение"]);
  assert.equal(rows(parsed[0])[2][1], "");
  assert.equal(rows(parsed[1])[1][2], long);
  assert.doesNotMatch(result.markdown, /^## Шаг/m);
});

test("empty source tables remain Markdown tables", async () => {
  const result = await render("<table></table>");
  assert.equal(tables(result.markdown).length, 1);
});

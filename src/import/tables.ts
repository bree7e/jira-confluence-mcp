import { createHash } from "node:crypto";
import type { CheerioAPI } from "cheerio";
import { flattenTableCell } from "./table-cell.js";

export interface TableReplacement {
  token: string;
  markdown: string;
}
interface Cell { html: string }
const MAX_COLUMNS = 512;

export function normalizeTables($: CheerioAPI, warn: (message: string) => void): TableReplacement[] {
  const tables = $("table").toArray();
  type Table = (typeof tables)[number];
  const originalHtml = $.root().html() || "";
  const replacements: TableReplacement[] = [];
  const sourceHash = createHash("sha256").update(originalHtml).digest("hex").slice(0, 8).toUpperCase();
  const marker = (markdown: string) => {
    let token = ("CFX" + replacements.length + sourceHash + "Z").padEnd(markdown.length, "Z");
    while (originalHtml.includes(token)) token += "Z";
    replacements.push({ token, markdown });
    return token;
  };
  const parents = new Map(tables.map(table => [table, $(table).parents("table").first()[0]]));
  const children = new Map<Table, Table[]>();
  for (const table of tables) {
    const parent = parents.get(table);
    if (parent) children.set(parent, [...(children.get(parent) || []), table]);
  }
  const usedIds = new Set((originalHtml.match(/\^table-[a-z0-9-]+/gi) || []).map(id => id.slice(1)));
  const references = new Map<Table, { number: number; id: string; token: string }>();
  for (const table of tables) {
    if (!parents.get(table)) continue;
    const node = $(table);
    const nativeId = node.attr("id") || node.attr("data-local-id") || node.attr("ac:local-id");
    // Ignore visual attributes in the fallback fingerprint.
    const fingerprint = node.clone();
    fingerprint.find("*").addBack().each((_, el) => {
      if (!("attribs" in el)) return;
      for (const key of Object.keys(el.attribs)) if (!["rowspan", "colspan", "href", "start", "value"].includes(key)) $(el).removeAttr(key);
    });
    const hash = createHash("sha256").update(nativeId ? "source:" + nativeId : fingerprint.html() || "").digest("hex").slice(0, 12);
    const base = "table-" + hash;
    let id = base, suffix = 2;
    while (usedIds.has(id)) id = base + "-" + suffix++;
    usedIds.add(id);
    const number = references.size + 1;
    references.set(table, { number, id, token: marker("[[#^" + id + "\\|[" + number + "]]]") });
  }

  function span(value: string | undefined, limit: number, isRow: boolean, number: number): number {
    if (value === undefined) return 1;
    if (isRow && value === "0") return limit;
    const parsed = Number(value);
    if (!isRow && parsed > MAX_COLUMNS) throw new Error("Table " + number + ": colspan exceeds " + MAX_COLUMNS);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > limit) {
      warn("Table " + number + ": invalid " + (isRow ? "rowspan" : "colspan") + " normalized");
      return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, limit) : 1;
    }
    return parsed;
  }
  const outputs = new Map<Table, ReturnType<CheerioAPI>>();
  // Children are detached before the parent's cells are expanded, so rowspan copies a reference, not a table.
  for (const table of [...tables].reverse()) {
    const node = $(table), number = tables.indexOf(table) + 1;
    const rows = node.find("tr").filter((_, row) => $(row).closest("table")[0] === table).toArray();
    const grid: Cell[][] = [];
    let merged = false;
    rows.forEach((row, r) => {
      grid[r] ||= [];
      let column = 0;
      const group = $(row).parent()[0];
      let end = r + 1;
      while (end < rows.length && $(rows[end]).parent()[0] === group) end++;
      $(row).children("td,th").each((_, element) => {
        const item = $(element);
        const rowspan = span(item.attr("rowspan"), end - r, true, number);
        const colspan = span(item.attr("colspan"), MAX_COLUMNS, false, number);
        while (Array.from({ length: colspan }, (_, offset) => grid[r][column + offset]).some(Boolean)) column++;
        if (column + colspan > MAX_COLUMNS) throw new Error("Table " + number + ": too many columns");
        const cell = { html: flattenTableCell($, item.html() || "") };
        for (let dr = 0; dr < rowspan; dr++) {
          grid[r + dr] ||= [];
          for (let dc = 0; dc < colspan; dc++) grid[r + dr][column + dc] = cell;
        }
        merged ||= rowspan > 1 || colspan > 1;
        column += colspan;
      });
    });
    const width = Math.max(0, ...grid.map(row => row.length));
    let headerRows = 0;
    while (headerRows < rows.length) {
      const row = $(rows[headerRows]);
      const header = row.parent().is("thead")
        || (row.children("th").length > 0 && row.children("td").toArray().every(cell => !$(cell).text().trim() && !$(cell).find("a,table").length));
      if (!header) break;
      headerRows++;
    }
    if (headerRows === rows.length) headerRows = Math.min(1, headerRows);
    const propertyTable = !headerRows && width === 2 && rows.every(row => $(row).children().first().is("th"));
    const headers = Array.from({ length: width }, (_, c) => {
      if (!headerRows) return propertyTable ? ["Поле", "Значение"][c] : "Столбец " + (c + 1);
      // Identity deduplication retains equal labels from distinct levels, but removes copies from rowspan.
      return [...new Set(grid.slice(0, headerRows).map(row => row[c]).filter(Boolean))]
        .map(cell => cell.html).filter(Boolean).join("<br>");
    });
    const output = $("<div></div>");
    const reference = references.get(table), caption = node.children("caption").first();
    if (reference) {
      const labels = headers.map(html => $("<span></span>").html(html).text().trim()).filter(Boolean);
      const title = caption.text().trim() || (labels.join(" / ").length <= 100 ? labels.join(" / ") : "") || "Вложенная таблица";
      output.append($("<p></p>").append($("<strong></strong>").text("[" + reference.number + "] " + title)));
    }
    if (caption.length) output.append($("<p></p>").append($("<strong></strong>").append(caption.contents().clone())));
    if (width) {
      const result = $("<table><thead></thead><tbody></tbody></table>");
      const addRow = (values: string[], tag: "th" | "td", section: string) => {
        const row = $("<tr></tr>");
        values.forEach(value => row.append($("<" + tag + "></" + tag + ">").html(value)));
        result.find(section).append(row);
      };
      addRow(headers, "th", "thead");
      grid.slice(headerRows).forEach(row => addRow(Array.from({ length: width }, (_, c) => row[c]?.html || ""), "td", "tbody"));
      output.append(result);
    } else {
      // Empty nested tables remain addressable instead of leaving a broken reference.
      output.append($("<table><thead><tr><th>Пустая таблица</th></tr></thead><tbody><tr><td></td></tr></tbody></table>"));
    }
    if (reference) output.append($("<p></p>").text(marker("^" + reference.id)));
    for (const child of children.get(table) || []) {
      const childOutput = outputs.get(child);
      if (!childOutput) throw new Error("Missing nested table output");
      output.append(childOutput);
    }
    outputs.set(table, output);
    if (merged) warn("Table " + number + ": merged cells expanded into rows/columns");
    if (reference) {
      node.replaceWith($("<span></span>").text(reference.token));
      warn("Table " + number + ": nested table extracted after its parent");
    } else node.replaceWith(output);
  }
  return replacements;
}

/** Restore Obsidian syntax after remark, avoiding double escaping of table pipes. */
export function restoreTableReferences(markdown: string, replacements: TableReplacement[]): string {
  for (const { token, markdown: replacement } of replacements) {
    if (!markdown.includes(token)) throw new Error("Table reference was lost during Markdown conversion");
    markdown = markdown.split(token).join(replacement);
  }
  return markdown;
}

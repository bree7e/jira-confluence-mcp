import type { CheerioAPI } from "cheerio";

/** Flatten block content into inline HTML; remark handles Markdown escaping once. */
export function flattenTableCell($: CheerioAPI, html: string): string {
  const source = $("<span></span>").html(html);
  type Node = ReturnType<typeof source.contents>[number];

  function clean(container: typeof source) {
    // Trim boundary whitespace/breaks only, without touching code or inline spaces.
    for (const edge of ["first", "last"] as const) {
      while (container.contents().length) {
        const node = (edge === "first" ? container.contents().first() : container.contents().last())[0];
        if ($(node).is("br") || (node.type === "text" && !node.data.trim())) $(node).remove();
        else break;
      }
    }
    return container;
  }
  function children(node: Node, path: number[], depth: number) {
    const output = $("<span></span>");
    if ("children" in node) for (const child of node.children) output.append(walk(child, path, depth).contents());
    return output;
  }
  function walk(node: Node, path: number[] = [], depth = 0): typeof source {
    const out = $("<span></span>");
    if (node.type === "text") return out.text(node.data.replace(/\s+/g, " "));
    if (!("tagName" in node)) return out;
    const tag = node.tagName.toLowerCase(), item = $(node);
    if (tag === "code") return out.append(item.clone().attr("data-import-code", item.text()));
    if (tag === "br") return out.append("<br>");
    if (tag === "ol" || tag === "ul") {
      const items = item.children("li").toArray();
      const reversed = item.attr("reversed") !== undefined;
      let ordinal = Number(item.attr("start") ?? (reversed ? items.length : 1));
      if (!Number.isInteger(ordinal)) ordinal = 1;
      out.append("<br>");
      for (const li of items) {
        const explicit = $(li).attr("value");
        if (explicit !== undefined && Number.isInteger(Number(explicit))) ordinal = Number(explicit);
        const nextPath = tag === "ol" ? [...path, ordinal] : path;
        const prefix = "\u00a0".repeat(depth * 4) + (tag === "ol" ? nextPath.join(".") + ". " : "- ");
        out.append($("<span></span>").text(prefix));
        out.append(clean(children(li, nextPath, depth + 1)).contents());
        out.append("<br>");
        ordinal += reversed ? -1 : 1;
      }
      return out;
    }
    if (tag === "pre") {
      const lines = item.text().replace(/\r\n?/g, "\n").split("\n");
      // A code block's terminal newline is not an additional blank line.
      if (lines.at(-1) === "") lines.pop();
      lines.forEach((line, i) => {
        if (i) out.append("<br>");
        out.append(line ? $("<code></code>").attr("data-import-code", line).text(line) : $("<span></span>").text("\u00a0"));
      });
      return out;
    }
    if (tag === "hr") return out.append("<br>").append($("<span></span>").text("—")).append("<br>");
    const inside = children(node, path, depth);
    if (/^h[1-6]$/.test(tag)) return out.append("<br>").append($("<strong></strong>").append(clean(inside).contents())).append("<br>");
    if (["p", "div", "section", "article", "dl", "dt", "dd", "blockquote"].includes(tag)) {
      return out.append("<br><br>").append(clean(inside).contents()).append("<br><br>");
    }
    // Preserve only inline markup and its attributes; lists/tables never reach remark as blocks.
    const copy = item.clone().empty().append(inside.contents());
    return out.append(copy);
  }
  const output = $("<span></span>");
  for (const node of source.contents().toArray()) output.append(walk(node).contents());
  // Remove separators contributed by nested block wrappers (not explicit code-line spacing).
  clean(output);
  return (output.html() || "").replace(/(?:<br\s*\/?>\s*){3,}/gi, "<br><br>");
}

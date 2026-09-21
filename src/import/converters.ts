import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { unified } from "unified";
import rehypeParse from "rehype-parse";
import rehypeRemark from "rehype-remark";
import remarkGfm from "remark-gfm";
import remarkStringify from "remark-stringify";

/** Confluence normalization and persistence are independent of the Markdown engine. */
export interface MarkdownConverter {
  readonly id: string;
  readonly version: string;
  convert(html: string): Promise<string>;
}

const turndown = new TurndownService({ headingStyle: "atx", bulletListMarker: "-", codeBlockStyle: "fenced",
  blankReplacement: (_content, node) => ["TD", "TH"].includes(node.nodeName)
    ? (node.previousSibling ? " " : "| ") + " |" : ("isBlock" in node && node.isBlock ? "\n\n" : ""),
});
turndown.use(gfm);
turndown.addRule("strictStrikethrough", {
  filter: node => ["DEL", "S", "STRIKE"].includes(node.nodeName),
  replacement: content => "~~" + content + "~~",
});
turndown.addRule("safeTableCell", {
  filter: ["th", "td"],
  replacement(content, node) {
    const prefix = node.previousSibling ? " " : "| ";
    return prefix + content.trim().replace(/\|/g, "\\|").replace(/\s*\n\s*/g, "<br>") + " |";
  },
});


export const converters: Record<string, MarkdownConverter> = {
  turndown: { id: "turndown", version: "1", async convert(html) { return turndown.turndown(html); } },
  remark: {
    id: "remark", version: "1",
    async convert(html) {
      return String(await unified().use(rehypeParse, { fragment: true }).use(rehypeRemark, { handlers: { br: () => ({ type: "html", value: "<br>" }) } })
        .use(remarkGfm).use(remarkStringify, { bullet: "-", fences: true }).process(html));
    },
  },
};

export function getConverter(name: string): MarkdownConverter {
  const converter = Object.hasOwn(converters, name) ? converters[name] : undefined;
  if (!converter) throw new Error(`Unknown converter: ${name}. Available: ${Object.keys(converters).join(", ")}`);
  return converter;
}

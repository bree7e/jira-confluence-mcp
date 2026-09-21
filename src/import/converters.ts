import { unified } from "unified";
import rehypeParse from "rehype-parse";
import rehypeRemark from "rehype-remark";
import remarkGfm from "remark-gfm";
import remarkStringify from "remark-stringify";

type HtmlText = { type: string; value?: string; children?: readonly HtmlText[] };
const textContent = (node: HtmlText): string => node.type === "text"
  ? node.value || "" : (node.children || []).map(textContent).join("");

/** Confluence normalization and persistence are independent of the Markdown engine. */
export interface MarkdownConverter {
  readonly id: string;
  readonly version: string;
  convert(html: string): Promise<string>;
}

export const converters: Record<string, MarkdownConverter> = {
  remark: {
    id: "remark",
    version: "3",
    async convert(html) {
      return String(
        await unified()
          .use(rehypeParse, { fragment: true })
          .use(rehypeRemark, {
            handlers: {
              br: () => ({ type: "html", value: "<br>" }),
              code: (_state, node) => {
                const original = node.properties.dataImportCode;
                const value = (typeof original === "string" ? original : textContent(node)).replace(/\r?\n/g, " ");
                // A backslash directly before a pipe cannot round-trip through GFM code spans.
                if (/\\+\|/.test(value)) return {
                  type: "html",
                  value: "<code>" + value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;").replace(/\|/g, "&#124;") + "</code>",
                };
                return { type: "inlineCode", value };
              },
            },
          })
          .use(remarkGfm, { tablePipeAlign: true })
          .use(remarkStringify, { bullet: "-", fences: true })
          .process(html),
      );
    },
  },
};

export function getConverter(name: string): MarkdownConverter {
  const converter = Object.hasOwn(converters, name)
    ? converters[name]
    : undefined;
  if (!converter)
    throw new Error(
      `Unknown converter: ${name}. Available: ${Object.keys(converters).join(", ")}`,
    );
  return converter;
}

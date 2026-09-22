import { load } from "cheerio";
import { normalizeTables } from "./tables.js";
import type { ConfluencePage } from "../types/confluence.js";

export interface SourceResolver {
  pageUrl(id: string): string;
  userUrl(username: string): string;
  resolveUser(key: string): Promise<{ username: string; displayName?: string }>;
  absoluteUrl(value: string): string;
  findPage(title: string, space: string): Promise<string>;
  attachment(pageId: string, filename: string): Promise<string>;
  jiraUrl(key?: string, jql?: string): string;
}

export async function normalize(
  page: ConfluencePage,
  resolver: SourceResolver,
) {
  const $ = load(page.body!.storage!.value, {
    xml: {
      xmlMode: false,
      decodeEntities: true,
      recognizeSelfClosing: true,
      recognizeCDATA: true,
    },
  });
  const warnings: string[] = [];
  const links = new Set<string>();
  const note = (message: string) => {
    warnings.push(message);
  };
  const makeLink = (label: string, href: string) =>
    $("<a></a>").attr("href", href).text(label);
  const safeUrl = (value: string) => {
    if (!value.trim()) throw new Error("Empty URL");
    const url = resolver.absoluteUrl(value);
    if (!/^https?:\/\//i.test(url) && !/^mailto:/i.test(url))
      throw new Error("Unsupported URL scheme");
    return url;
  };
  async function target(node: ReturnType<typeof $>): Promise<string> {
    const id = node.attr("ri:content-id");
    if (id) return id;
    const title = node.attr("ri:content-title");
    if (!title) return page.id;
    return resolver.findPage(
      title,
      node.attr("ri:space-key") || page.space!.key,
    );
  }

  $("script,style").remove();
  // Resolve resource descriptors before unwrapping their parent macros.
  for (const el of $("ac\\:image").toArray()) {
    const node = $(el),
      attachment = node.find("ri\\:attachment").first();
    const filename = attachment.attr("ri:filename") || "Изображение";
    try {
      const href = attachment.length
        ? await resolver.attachment(
            await target(attachment.find("ri\\:page").first()),
            filename,
          )
        : safeUrl(node.find("ri\\:url").attr("ri:value") || "");
      node.replaceWith(
        makeLink(
          node.attr("ac:alt") || "Изображение: " + filename,
          safeUrl(href),
        ),
      );
    } catch (error) {
      note("Image " + filename + ": " + (error as Error).message);
      node.replaceWith(
        makeLink(
          "Изображение недоступно: " + filename,
          resolver.pageUrl(page.id),
        ),
      );
    }
  }
  for (const el of $("ac\\:link").toArray()) {
    const node = $(el),
      resource = node.find("ri\\:page").first();
    const label =
      node.find("ac\\:plain-text-link-body,ac\\:link-body").text() ||
      resource.attr("ri:content-title") ||
      node.find("ri\\:attachment").attr("ri:filename") ||
      node.text();
    try {
      const user = node.find("ri\\:user").first();
      if (user.length) {
        const key = user.attr("ri:userkey");
        const resolved = !user.attr("ri:username") && key
          ? await resolver.resolveUser(key)
          : undefined;
        const username = user.attr("ri:username") || resolved?.username;
        if (!username) throw new Error("User link has no username or userkey");
        node.replaceWith(
          makeLink(label || resolved?.displayName || username, safeUrl(resolver.userUrl(username))),
        );
        continue;
      }
      const id = resource.length ? await target(resource) : page.id;
      const attachment = node.find("ri\\:attachment").first();
      let href = attachment.length
        ? await resolver.attachment(id, attachment.attr("ri:filename")!)
        : resolver.pageUrl(id);
      if (node.attr("ac:anchor"))
        href += "#" + encodeURIComponent(node.attr("ac:anchor")!);
      links.add(id);
      node.replaceWith(makeLink(label || "Ссылка", safeUrl(href)));
    } catch (error) {
      note("Link " + label + ": " + (error as Error).message);
      node.replaceWith(
        $("<span></span>").text(label + " [не удалось разрешить ссылку]"),
      );
    }
  }
  for (const el of $("ac\\:structured-macro,ac\\:macro").toArray().reverse()) {
    const node = $(el),
      name = node.attr("ac:name") || "unknown";
    const params = new Map(
      node
        .children("ac\\:parameter")
        .toArray()
        .map((p) => [$(p).attr("ac:name"), $(p).text()]),
    );
    const body = node.children("ac\\:rich-text-body");
    if (name === "toc") node.remove();
    else if (
      [
        "section",
        "column",
        "panel",
        "expand",
        "info",
        "note",
        "warning",
        "tip",
      ].includes(name)
    ) {
      const title = params.get("title");
      if (title)
        node.before($("<p></p>").append($("<strong></strong>").text(title)));
      node.replaceWith(body.contents());
    } else if (name === "jira") {
      const key = params.get("key"),
        jql = params.get("jqlQuery");
      if (key || jql)
        node.replaceWith(
          makeLink(key || "Jira: " + jql, resolver.jiraUrl(key, jql)),
        );
      else {
        note("Jira macro without key or JQL");
        node.replaceWith("[Jira: нет ключа или запроса]");
      }
    } else if (name === "code" || name === "noformat") {
      const code = $("<code></code>").text(
        node.children("ac\\:plain-text-body").text(),
      );
      const language = params.get("language");
      if (language && /^[\w+-]+$/.test(language))
        code.attr("class", "language-" + language);
      node.replaceWith($("<pre></pre>").append(code));
    } else {
      note("Unsupported macro: " + name);
      node.before($("<p></p>").text("[Макрос Confluence: " + name + "]"));
      node.replaceWith(
        body.length ? body.contents() : $("<p></p>").text(node.text()),
      );
    }
  }
  $("ac\\:inline-comment-marker").each((_, el) => {
    $(el).replaceWith($(el).contents());
  });
  $("img").each((_, el) => {
    const node = $(el);
    try {
      node.replaceWith(
        makeLink(
          node.attr("alt") || "Изображение",
          safeUrl(node.attr("src") || ""),
        ),
      );
    } catch {
      note("Invalid image URL");
      node.replaceWith("[Изображение: некорректный URL]");
    }
  });
  $("a[href]").each((_, el) => {
    const node = $(el),
      href = node.attr("href")!;
    try {
      const url = safeUrl(
        href.startsWith("#") ? resolver.pageUrl(page.id) + href : href,
      );
      node.attr("href", url);
      const parsed = new URL(url);
      const id = parsed.searchParams.get("pageId");
      if (id && parsed.origin === new URL(resolver.pageUrl(page.id)).origin)
        links.add(id);
    } catch {
      note("Unsupported link: " + node.text());
      node.replaceWith(node.contents());
    }
  });
  const minimumHeading = Math.min(
    6,
    ...$("h1,h2,h3,h4,h5,h6")
      .toArray()
      .map((el) => Number(el.tagName.slice(1))),
  );
  $("h1,h2,h3,h4,h5,h6").each((_, el) => {
    const node = $(el),
      level = Number(el.tagName.slice(1)) - minimumHeading + 2;
    if (level > 6) note("Heading deeper than H6 flattened to H6");
    const tag = "h" + Math.min(level, 6);
    node.replaceWith($("<" + tag + "></" + tag + ">").append(node.contents()));
  });

  const tableReplacements = normalizeTables($, note);
  $("*").each((_, el) => {
    if ("tagName" in el && el.tagName.includes(":")) {
      note("Unprocessed element: " + el.tagName);
      $(el).replaceWith($(el).contents());
    }
  });
  // Serialize normalized HTML for the Markdown adapter.
  return {
    html: $.root().html() || "",
    tableReplacements,
    warnings: [...new Set(warnings)],
    links: [...links].sort(),
  };
}

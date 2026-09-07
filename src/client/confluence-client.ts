import { HttpClient } from "./http-client.js";
import type {
  ConfluenceSearchParams,
  ConfluenceSearchResult,
  ConfluencePage,
  CreatePageBody,
  UpdatePageBody,
  ConfluenceSpacesResult,
  ConfluenceSpace,
} from "../types/confluence.js";

export class ConfluenceClient {
  private http: HttpClient;
  private baseUrl: string;

  constructor(baseUrl: string, username: string, apiToken: string) {
    // Confluence Server/DC v8+ использует Personal Access Token (Bearer)
    this.http = new HttpClient({
      baseUrl,
      username,
      apiToken,
      authType: "bearer",
    });
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async searchContent(
    params: ConfluenceSearchParams,
  ): Promise<ConfluenceSearchResult> {
    const query = new URLSearchParams({
      cql: params.cql,
      limit: String(params.limit ?? 25),
      start: String(params.start ?? 0),
    });
    if (params.expand?.length) {
      query.set("expand", params.expand.join(","));
    }
    return this.http.get<ConfluenceSearchResult>(
      `/rest/api/content/search?${query.toString()}`,
    );
  }

  getPageUrl(page: ConfluencePage): string {
    const webui = page._links?.webui;
    if (!webui) {
      return `${this.baseUrl}/pages/viewpage.action?pageId=${encodeURIComponent(page.id)}`;
    }
    if (/^https?:\/\//i.test(webui)) return webui;
    return `${this.baseUrl}${webui.startsWith("/") ? "" : "/"}${webui}`;
  }

  async getPage(pageId: string, expand?: string[]): Promise<ConfluencePage> {
    const query = expand?.length ? `?expand=${expand.join(",")}` : "";
    return this.http.get<ConfluencePage>(
      `/rest/api/content/${encodeURIComponent(pageId)}${query}`,
    );
  }

  async createPage(body: CreatePageBody): Promise<ConfluencePage> {
    const query = "?expand=space,version,body.atlas_doc_format";
    return this.http.post<ConfluencePage>(
      `/rest/api/content${query}`,
      body as unknown as Record<string, unknown>,
    );
  }

  async updatePage(body: UpdatePageBody): Promise<ConfluencePage> {
    const query = "?expand=space,version,body.atlas_doc_format";
    return this.http.put<ConfluencePage>(
      `/rest/api/content/${encodeURIComponent(body.id)}${query}`,
      body as unknown as Record<string, unknown>,
    );
  }

  async listSpaces(): Promise<ConfluenceSpacesResult> {
    return this.http.get<ConfluenceSpacesResult>("/rest/api/space");
  }
}

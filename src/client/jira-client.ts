import { HttpClient } from "./http-client.js";
import type {
  JiraSearchParams,
  JiraSearchResult,
  JiraIssue,
  JiraProject,
  CreateIssueFields,
  UpdateIssueFields,
  JiraCommentsResult,
  JiraComment,
  JiraRemoteLink,
  JiraFieldDefinition,
} from "../types/jira.js";

export class JiraClient {
  private http: HttpClient;

  constructor(baseUrl: string, username: string, apiToken: string) {
    this.http = new HttpClient({ baseUrl, username, apiToken });
  }

  async searchIssues(params: JiraSearchParams): Promise<JiraSearchResult> {
    const query = new URLSearchParams({
      jql: params.jql,
      startAt: String(params.startAt ?? 0),
      maxResults: String(params.maxResults ?? 50),
    });
    if (params.fields && params.fields.length > 0) {
      query.set("fields", params.fields.join(","));
    }
    return this.http.get<JiraSearchResult>(
      `/rest/api/2/search?${query.toString()}`,
    );
  }

  async getIssue(issueKey: string, fields?: string[]): Promise<JiraIssue> {
    const query = fields?.length ? `?fields=${fields.join(",")}` : "";
    return this.http.get<JiraIssue>(
      `/rest/api/2/issue/${encodeURIComponent(issueKey)}${query}`,
    );
  }

  async getRemoteLinks(issueKey: string): Promise<JiraRemoteLink[]> {
    return this.http.get<JiraRemoteLink[]>(
      `/rest/api/2/issue/${encodeURIComponent(issueKey)}/remotelink`,
    );
  }

  async getFields(): Promise<JiraFieldDefinition[]> {
    return this.http.get<JiraFieldDefinition[]>("/rest/api/2/field");
  }

  async createIssue(fields: CreateIssueFields): Promise<JiraIssue> {
    return this.http.post<JiraIssue>("/rest/api/2/issue", { fields });
  }

  async updateIssue(
    issueKey: string,
    fields: UpdateIssueFields,
  ): Promise<void> {
    return this.http.put<void>(
      `/rest/api/2/issue/${encodeURIComponent(issueKey)}`,
      { fields },
    );
  }

  async listProjects(): Promise<JiraProject[]> {
    return this.http.get<JiraProject[]>("/rest/api/2/project");
  }

  async getComments(issueKey: string): Promise<JiraCommentsResult> {
    return this.http.get<JiraCommentsResult>(
      `/rest/api/2/issue/${encodeURIComponent(issueKey)}/comment`,
    );
  }

  async addComment(issueKey: string, body: string): Promise<JiraComment> {
    return this.http.post<JiraComment>(
      `/rest/api/2/issue/${encodeURIComponent(issueKey)}/comment`,
      { body },
    );
  }
}

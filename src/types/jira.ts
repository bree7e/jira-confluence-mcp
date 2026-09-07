// --- Request types ---

export interface JiraSearchParams {
  jql: string;
  startAt?: number;
  maxResults?: number;
  fields?: string[];
}

export interface CreateIssueFields {
  project: { key: string };
  summary: string;
  description?: string;
  issuetype?: { name: string };
  priority?: { name: string };
  assignee?: { accountId?: string; name?: string };
}

export interface UpdateIssueFields {
  summary?: string;
  description?: string;
  priority?: { name: string };
  assignee?: { accountId?: string; name?: string };
}

// --- Response types ---

export interface JiraIssue {
  id: string;
  key: string;
  self: string;
  fields: Record<string, unknown>;
}

export interface JiraIssueReference {
  id?: string;
  key: string;
  self?: string;
  summary?: string;
  issueType?: string;
  status?: string;
}

export interface JiraIssueLink {
  id: string;
  type: { id?: string; name: string; inward?: string; outward?: string };
  direction: "inward" | "outward";
  issue: JiraIssueReference;
}

export interface JiraRemoteLink {
  id: number;
  self?: string;
  globalId?: string;
  relationship?: string;
  application?: { type?: string; name?: string };
  object: { url: string; title: string; summary?: string };
}

export interface JiraFieldDefinition {
  id: string;
  name: string;
  custom: boolean;
}

export interface JiraSearchResult {
  startAt: number;
  maxResults: number;
  total: number;
  issues: JiraIssue[];
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  self: string;
  projectTypeKey: string;
  simplified: boolean;
  style: string;
  avatarUrls: Record<string, string>;
}

export interface JiraComment {
  id: string;
  self: string;
  body: unknown;
  author: {
    displayName: string;
    emailAddress?: string;
    active: boolean;
  };
  created: string;
  updated: string;
}

export interface JiraCommentsResult {
  startAt: number;
  maxResults: number;
  total: number;
  comments: JiraComment[];
}

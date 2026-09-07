// --- Request types ---

export interface ConfluenceSearchParams {
  cql: string;
  limit?: number;
  start?: number;
  expand?: string[];
}

export interface CreatePageBody {
  type: "page";
  title: string;
  space: { key: string };
  ancestors?: { id: string }[];
  body: {
    atlas_doc_format?: {
      value: string;
      representation: "atlas_doc_format";
    };
    storage?: {
      value: string;
      representation: "storage";
    };
  };
}

export interface UpdatePageBody {
  id: string;
  type: "page";
  title?: string;
  body?: {
    atlas_doc_format?: {
      value: string;
      representation: "atlas_doc_format";
    };
    storage?: {
      value: string;
      representation: "storage";
    };
  };
  version: {
    number: number;
  };
}

// --- Response types ---

export interface ConfluencePage {
  id: string;
  type: string;
  status: string;
  title: string;
  space?: { id: string; key: string; name: string };
  version?: {
    number: number;
    when: string;
    by: { displayName: string };
  };
  body?: {
    atlas_doc_format?: { value: string; representation: string };
    storage?: { value: string; representation: string };
  };
  _links: {
    self: string;
    editui?: string;
    webui?: string;
  };
}

export interface ConfluenceSearchResult {
  results: ConfluencePage[];
  start: number;
  limit: number;
  size: number;
  _links: {
    self: string;
    next?: string;
    prev?: string;
  };
}

export interface ConfluenceSpace {
  id: string;
  key: string;
  name: string;
  type: string;
  status: string;
  _links: {
    self: string;
  };
}

export interface ConfluenceSpacesResult {
  results: ConfluenceSpace[];
  start: number;
  limit: number;
  size: number;
  _links: {
    self: string;
    next?: string;
    prev?: string;
  };
}

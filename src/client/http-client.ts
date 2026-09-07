export type AuthType = "basic" | "bearer";

export interface HttpClientConfig {
  baseUrl: string;
  username: string;
  apiToken: string;
  authType?: AuthType;
}

export class HttpClient {
  private baseUrl: string;
  private authHeader: string;

  constructor(config: HttpClientConfig) {
    this.baseUrl = config.baseUrl;
    this.authHeader = buildAuthHeader(
      config.authType ?? "basic",
      config.username,
      config.apiToken,
    );
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      Accept: "application/json",
    };

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "No error body");
      throw new Error(
        `HTTP ${response.status} ${response.statusText}: ${errorText}`,
      );
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PUT", path, body);
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }
}

function buildAuthHeader(
  authType: AuthType,
  username: string,
  apiToken: string,
): string {
  if (authType === "bearer") {
    return `Bearer ${apiToken}`;
  }
  // basic
  const encoded = Buffer.from(`${username}:${apiToken}`).toString("base64");
  return `Basic ${encoded}`;
}

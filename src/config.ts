export interface Config {
  jira: {
    url: string;
    username: string;
    apiToken: string;
  };
  confluence: {
    url: string;
    username: string;
    apiToken: string;
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadConfig(): Config {
  return {
    jira: {
      url: requireEnv("JIRA_URL").replace(/\/+$/, ""),
      username: requireEnv("JIRA_USERNAME"),
      apiToken: requireEnv("JIRA_API_TOKEN"),
    },
    confluence: {
      url: requireEnv("CONFLUENCE_URL").replace(/\/+$/, ""),
      username: requireEnv("CONFLUENCE_USERNAME"),
      apiToken: requireEnv("CONFLUENCE_API_TOKEN"),
    },
  };
}

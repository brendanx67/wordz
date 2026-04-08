import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";

// ─── CONFIGURATION ───────────────────────────────────────────────────────────
// Priority: env vars > credentials.json next to this script > ~/.wordz-mcp/credentials.json

interface Credentials {
  api_url?: string;
  api_key?: string;
}

function loadCredentials(): Credentials {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const paths = [
    join(scriptDir, "credentials.json"),
    join(homedir(), ".wordz-mcp", "credentials.json"),
  ];

  for (const p of paths) {
    if (existsSync(p)) {
      try {
        return JSON.parse(readFileSync(p, "utf-8")) as Credentials;
      } catch (err) {
        console.error(`Warning: Failed to parse ${p}: ${(err as Error).message}`);
      }
    }
  }
  return {};
}

const creds = loadCredentials();
export const API_URL = process.env.WORDZ_API_URL || creds.api_url || "";
export const API_KEY = process.env.WORDZ_API_KEY || creds.api_key || "";

if (!API_URL || !API_KEY) {
  console.error(
    "Wordz MCP: No credentials found.\n\n" +
      "Create ~/.wordz-mcp/credentials.json:\n" +
      '  {\n' +
      '    "api_url": "https://your-project.supabase.co/functions/v1/game-api",\n' +
      '    "api_key": "your-api-key-here"\n' +
      '  }\n\n' +
      "Or set environment variables: WORDZ_API_URL, WORDZ_API_KEY"
  );
  process.exit(1);
}

export async function apiCall(
  path: string,
  method: "GET" | "POST" = "GET",
  body?: unknown,
  gameId?: string,
): Promise<unknown> {
  const url = method === "GET" && gameId
    ? `${API_URL}/${path}?game_id=${gameId}`
    : `${API_URL}/${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      "x-api-key": API_KEY,
      "Content-Type": "application/json",
    },
    body: body
      ? JSON.stringify({ ...(body as Record<string, unknown>), ...(gameId ? { game_id: gameId } : {}) })
      : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `API error: ${res.status}`);
  }
  return data;
}

// Chat MCP tools set this header so that messages posted via the MCP server
// are attributed with `posted_by_agent = "claude-code"` even though the caller
// authenticates with an api_key whose name might be different.
export const MCP_AGENT_NAME = "claude-code";

export async function chatApiCall(
  path: string,
  method: "GET" | "POST" = "GET",
  body?: unknown,
): Promise<unknown> {
  const res = await fetch(`${API_URL}/${path}`, {
    method,
    headers: {
      "x-api-key": API_KEY,
      "Content-Type": "application/json",
      "x-posted-by-agent": MCP_AGENT_NAME,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `API error: ${res.status}`);
  }
  return data;
}

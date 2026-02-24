import { setTimeout as delay } from "node:timers/promises";

const ALLOWLIST = ["api.internal.local", "hooks.slack.com"];

export interface HttpRequestInput {
  url: string;
  method?: string;
  body?: unknown;
  timeoutMs?: number;
}

export async function runHttpRequest(input: HttpRequestInput): Promise<{ status: number; body: string }> {
  const host = new URL(input.url).hostname;
  if (!ALLOWLIST.includes(host)) {
    throw new Error(`host not allowed: ${host}`);
  }

  const timeoutMs = input.timeoutMs ?? 4000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(input.url, {
      method: input.method ?? "GET",
      headers: { "content-type": "application/json" },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: controller.signal,
    });

    const text = await response.text();
    return { status: response.status, body: text };
  } catch (error) {
    await delay(300);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

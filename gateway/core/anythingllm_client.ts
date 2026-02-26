import type { Event } from "./event";
import type { ToolProposal } from "./proposals/schema";

export interface BrainClient {
  propose(event: Event): Promise<ToolProposal>;
  summarize(event: Event, toolResult: unknown): Promise<string>;
}

export interface AnythingLlmClientConfig {
  baseUrl: string;
  apiKey: string;
  model?: string;
}

interface ChatResponse {
  textResponse?: string;
  response?: string;
  text?: string;
}

export class AnythingLlmClient implements BrainClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model?: string;

  constructor(config: AnythingLlmClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.apiKey = config.apiKey;
    this.model = config.model;
  }

  async propose(event: Event): Promise<ToolProposal> {
    const systemInstruction = [
      "You are a proposal-only agent.",
      "Never execute tools directly.",
      "Return only JSON matching:",
      "{trace_id,type:'tool_proposal',tool,risk,inputs,reason,idempotency_key}",
      "No markdown and no prose.",
    ].join(" ");

    const userPrompt = JSON.stringify({
      mode: "tool_proposal",
      event,
      allowed_tools: ["http_request", "run_job", "db_query", "send_message", "shell_command"],
      risk_levels: ["low", "medium", "high"],
    });

    const raw = await this.chat(event.workspace, event.message.text, systemInstruction, userPrompt);
    const proposal = this.extractJson<ToolProposal>(raw);
    if (proposal.trace_id !== event.trace_id) {
      proposal.trace_id = event.trace_id;
    }
    return proposal;
  }

  async summarize(event: Event, toolResult: unknown): Promise<string> {
    const systemInstruction = "You are a concise assistant. Summarize tool results for the end user in Traditional Chinese.";
    const userPrompt = JSON.stringify({ mode: "reply", event, toolResult });
    return this.chat(event.workspace, event.message.text, systemInstruction, userPrompt);
  }

  private async chat(workspace: string, message: string, system: string, context: string): Promise<string> {
    const url = `${this.baseUrl}/api/v1/workspace/${encodeURIComponent(workspace)}/chat`;
    const payload = {
      message,
      mode: "chat",
      system,
      context,
      model: this.model,
    };

    if (!this.apiKey) {
      throw new Error("ANYTHINGLLM_API_KEY is empty. Please set it in .env.gateway before sending commands.");
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      const details = (error as Error).message || "unknown error";
      throw new Error(`AnythingLLM connection failed (${url}): ${details}`);
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`AnythingLLM chat failed (${response.status}): ${body}`);
    }

    const data = (await response.json()) as ChatResponse;
    return data.textResponse ?? data.response ?? data.text ?? "";
  }

  private extractJson<T>(raw: string): T {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const jsonText = fenced?.[1] ?? raw;
    return JSON.parse(jsonText) as T;
  }
}

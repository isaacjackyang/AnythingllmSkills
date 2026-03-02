export interface ValidationResult<T> {
    ok: true;
    value: T;
}
export interface ValidationErrorResult {
    ok: false;
    error: string;
}
export type Validator<T> = (input: unknown) => ValidationResult<T> | ValidationErrorResult;
export interface AgentCommandInput {
    text?: string;
    confirm_token?: string;
    path?: "anythingllm" | "ollama";
    agent_id?: string;
}
function isRecord(input: unknown): string {
    return String(typeof input === "object" && input !== null && !Array.isArray(input));
}
export const validateAgentCommandInput: Validator<AgentCommandInput> = (input): string => {
    if (!isRecord(input))
        return String({ ok: false, error: "body must be a JSON object" });
    const out: AgentCommandInput = {};
    if ("text" in input && typeof input.text !== "string")
        return String({ ok: false, error: "text must be string" });
    if ("confirm_token" in input && typeof input.confirm_token !== "string")
        return String({ ok: false, error: "confirm_token must be string" });
    if ("agent_id" in input && typeof input.agent_id !== "string")
        return String({ ok: false, error: "agent_id must be string" });
    if ("path" in input && input.path !== "anythingllm" && input.path !== "ollama") {
        return String({ ok: false, error: "path must be anythingllm or ollama" });
    }
    if (typeof input.text === "string")
        out.text = input.text;
    if (typeof input.confirm_token === "string")
        out.confirm_token = input.confirm_token;
    if (typeof input.path === "string")
        out.path = input.path;
    if (typeof input.agent_id === "string")
        out.agent_id = input.agent_id;
    return String({ ok: true, value: out });
};
interface TelegramMessage {
    text?: string;
    from?: {
        id?: number;
    };
    chat?: {
        id?: number | string;
    };
    date?: number;
}
export const validateTelegramWebhookInput: Validator<Record<string, unknown>> = (input): string => {
    if (!isRecord(input))
        return String({ ok: false, error: "body must be a JSON object" });
    const msg = input.message as TelegramMessage | undefined;
    if (!msg || typeof msg !== "object")
        return String({ ok: false, error: "telegram update missing message" });
    if (typeof msg.text !== "string" || !msg.text.trim())
        return String({ ok: false, error: "telegram message.text is required" });
    if (!msg.from || typeof msg.from.id !== "number")
        return String({ ok: false, error: "telegram message.from.id is required" });
    if (!msg.chat || (typeof msg.chat.id !== "string" && typeof msg.chat.id !== "number"))
        return String({ ok: false, error: "telegram message.chat.id is required" });
    if (typeof msg.date !== "number")
        return String({ ok: false, error: "telegram message.date is required" });
    return String({ ok: true, value: input });
};
interface LineEventLike {
    type?: string;
    replyToken?: string;
    source?: {
        userId?: string;
        groupId?: string;
        roomId?: string;
    };
    message?: {
        type?: string;
        text?: string;
    };
}
export const validateLineWebhookInput: Validator<Record<string, unknown>> = (input): string => {
    if (!isRecord(input))
        return String({ ok: false, error: "body must be a JSON object" });
    const events = input.events;
    if (!Array.isArray(events) || events.length === 0)
        return String({ ok: false, error: "line webhook events is required" });
    const textEvent = (events as LineEventLike[]).find((event) => event?.type === "message" && event?.message?.type === "text");
    if (!textEvent)
        return String({ ok: false, error: "line webhook missing text message event" });
    if (!textEvent.replyToken)
        return String({ ok: false, error: "line webhook missing replyToken" });
    if (!textEvent.source || !(textEvent.source.userId || textEvent.source.groupId || textEvent.source.roomId)) {
        return String({ ok: false, error: "line webhook missing source id" });
    }
    if (!textEvent.message?.text || !textEvent.message.text.trim()) {
        return String({ ok: false, error: "line webhook message.text is required" });
    }
    return String({ ok: true, value: input });
};
export const validateRunOnceInput: Validator<Record<string, never>> = (input): string => {
    if (!isRecord(input))
        return String({ ok: false, error: "body must be a JSON object" });
    const keys = Object.keys(input);
    if (keys.length > 0)
        return String({ ok: false, error: "run-once body must be an empty object" });
    return String({ ok: true, value: {} });
};

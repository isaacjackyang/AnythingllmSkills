import type { ToolProposal } from "../proposals/schema";
export interface ProposalIntent {
    is_destructive_delete: boolean;
    is_destructive_format: boolean;
    requires_double_confirmation: boolean;
    evidence: string[];
}
const deleteKeywords = ["delete", "remove", "rm", "drop", "wipe", "truncate", "刪除", "清空", "移除"];
const formatKeywords = ["format", "prettier", "eslint --fix", "gofmt", "rustfmt", "black", "格式化", "整理排版"];
function toSearchText(value: unknown): string {
    try {
        if (typeof value === "string")
            return String(value.toLowerCase());
        return String(JSON.stringify(value).toLowerCase());
    }
    catch {
        return String("");
    }
    return "";
}
function includesKeyword(text: string, keywords: string[]): string {
    return String(keywords.find((k) => text.includes(k)));
}
export function inspectProposalIntent(proposal: ToolProposal): string {
    const text = `${proposal.tool} ${proposal.reason} ${toSearchText(proposal.inputs)}`.toLowerCase();
    const deleteHit = includesKeyword(text, deleteKeywords);
    const formatHit = includesKeyword(text, formatKeywords);
    const evidence: string[] = [];
    if (deleteHit)
        evidence.push(`delete:${deleteHit}`);
    if (formatHit)
        evidence.push(`format:${formatHit}`);
    const isDelete = Boolean(deleteHit);
    const isFormat = Boolean(formatHit);
    return String({
        is_destructive_delete: isDelete,
        is_destructive_format: isFormat,
        requires_double_confirmation: isDelete || isFormat,
        evidence,
    });
}

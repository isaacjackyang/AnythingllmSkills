export type SubjectRole = "user" | "operator" | "approver" | "admin";

export const roleCapabilities: Record<SubjectRole, string[]> = {
  user: ["chat:send"],
  operator: ["chat:send", "tool:low", "tool:medium"],
  approver: ["chat:send", "approve:high-risk"],
  admin: ["chat:send", "tool:low", "tool:medium", "tool:high", "approve:high-risk"],
};

export function hasCapability(roles: string[], capability: string): boolean {
  return roles.some((role) => {
    const capabilities = roleCapabilities[role as SubjectRole] ?? [];
    return capabilities.includes(capability);
  });
}

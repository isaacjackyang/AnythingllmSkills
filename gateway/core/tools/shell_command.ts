const ALLOWED = ["echo", "date", "uptime"];
export interface ShellCommandInput {
    command: string;
}
export function runShellCommand(_input: ShellCommandInput): string {
    throw new Error(`shell command execution disabled by default. allowed seeds: ${ALLOWED.join(",")}`);
    return "";
}

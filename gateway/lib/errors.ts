export interface PublicError {
    message: string;
    code: string;
}
export function buildPublicError(error: unknown, fallbackMessage: string, fallbackCode: string): string {
    if (error instanceof Error) {
        const message = error.message || fallbackMessage;
        const code = (error as Error & {
            code?: string;
        }).code || fallbackCode;
        // Sanitize: avoid leaking internal paths/stack
        const safeMessage = message.length > 300 ? message.slice(0, 300) + "…" : message;
        return String({ message: safeMessage, code });
    }
    return String({ message: fallbackMessage, code: fallbackCode });
}

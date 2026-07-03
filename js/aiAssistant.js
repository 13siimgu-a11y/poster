import { detectCommand } from "./aiCommands.js";

export class AIService {
    async sendMessage(message, context) {
        try {
            const response = await fetch("/api/ai/chat", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    message,
                    context,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                return {
                    role: "assistant",
                    content: data.reply || "AI backend вернул ошибку.",
                    action: null,
                };
            }

            const localIntent = detectCommand(message, context);
            const backendAction = data.action && typeof data.action === "object" && data.action.type
                ? data.action
                : null;

            return {
                role: "assistant",
                content: data.reply,
                action: localIntent.action || backendAction,
            };
        } catch {
            const result = detectCommand(message, context);
            return {
                role: "assistant",
                content: `${result.reply}\n\nЛокальный режим: backend AI не запущен или ключ не настроен.`,
                action: result.action,
            };
        }
    }
}

import { detectCommand } from "./aiCommands.js";
import { api } from "./apiClient.js";

export class AIService {
    async sendMessage(message, context) {
        try {
            const data = await api.post("/ai/chat", { message, context });

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

import { AIService } from "./aiAssistant.js";
import { executeAction } from "./aiActions.js";
import { loadContext } from "./aiContext.js";
import { loadConversation, saveConversation, searchConversation } from "./aiHistory.js";
import { AI_QUICK_ACTIONS, getSuggestions } from "./aiSuggestions.js";

let contextProvider = null;
let helpers = {};
let aiService = new AIService();
let pendingAction = null;
let isSending = false;

export function initAIChat(provider, uiHelpers = {}) {
    contextProvider = provider;
    helpers = uiHelpers;
    bindAIEvents();
    renderAIChat();
}

export function openAIChat() {
    document.getElementById("aiAssistantPanel").hidden = false;
    renderAIChat();
}

export function closeAIChat() {
    document.getElementById("aiAssistantPanel").hidden = true;
}

export async function sendAIMessage(message) {
    const context = loadContext(contextProvider());
    pendingAction = pendingAction || loadPendingAction(context);
    saveConversation(context.companyId, context.user.id, { role: "user", content: message, actions: [] });
    isSending = true;
    renderAIChat();

    if (isConfirmation(message) && pendingAction) {
        let actionResult = null;
        try {
            actionResult = await executeAction(pendingAction, context);
        } catch (error) {
            actionResult = { error: error.message || "Не удалось выполнить действие." };
        }
        const count = getResultCount(actionResult);
        saveConversation(context.companyId, context.user.id, {
            role: "assistant",
            content: getActionMessage(actionResult, pendingAction, count),
            actions: actionResult ? [actionResult] : [],
        });
        pendingAction = null;
        clearPendingAction(context);
        isSending = false;
        helpers.showToast?.(count ? "AI выполнил действие" : "AI не смог выполнить действие");
        await helpers.refreshData?.();
        renderAIChat();
        return;
    }

    try {
        const response = await aiService.sendMessage(message, context);
        let actionResult = null;

        if (response.action?.pending) {
            pendingAction = response.action;
            savePendingAction(context, pendingAction);
        } else if (response.action) {
            actionResult = await executeAction(response.action, context);
            helpers.showToast?.("AI выполнил действие");
            await helpers.refreshData?.();
        }

        saveConversation(context.companyId, context.user.id, {
            role: "assistant",
            content: response.content,
            actions: actionResult ? [actionResult] : [],
        });
    } catch (error) {
        saveConversation(context.companyId, context.user.id, {
            role: "assistant",
            content: error.message || "Не удалось выполнить запрос AI. Попробуйте ещё раз.",
            actions: [],
        });
    } finally {
        isSending = false;
        renderAIChat();
    }
}

function getPendingKey(context) {
    return `posPosterAIPendingAction:${context.companyId}:${context.user.id}`;
}

function savePendingAction(context, action) {
    localStorage.setItem(getPendingKey(context), JSON.stringify(action));
}

function loadPendingAction(context) {
    const rawAction = localStorage.getItem(getPendingKey(context));
    if (!rawAction) return null;

    try {
        return JSON.parse(rawAction);
    } catch {
        return null;
    }
}

function clearPendingAction(context) {
    localStorage.removeItem(getPendingKey(context));
}

function isConfirmation(message) {
    const normalized = message.trim().toLowerCase();
    return ["да", "подтверждаю", "подтвердить", "создай", "добавь", "ок", "ok"].includes(normalized);
}

function getResultCount(result) {
    if (!result || result.error) return 0;
    if (Array.isArray(result)) return result.filter((item) => item && !item.error).length;
    return 1;
}

function getActionMessage(result, action, count) {
    if (result?.error) {
        return `Не удалось выполнить действие: ${result.error}`;
    }

    return count
        ? `Готово. ${action.description || action.type}. Создано/обновлено объектов: ${count}. Данные сохранены в базе и будут видны на других устройствах.`
        : "Не удалось выполнить ожидающее действие.";
}

function bindAIEvents() {
    document.getElementById("aiFloatingButton").addEventListener("click", openAIChat);
    document.getElementById("openAIButton").addEventListener("click", openAIChat);
    document.querySelectorAll("[data-close-ai]").forEach((item) => item.addEventListener("click", closeAIChat));
    document.getElementById("aiChatForm").addEventListener("submit", (event) => {
        event.preventDefault();
        const input = document.getElementById("aiMessageInput");
        const message = input.value.trim();
        if (!message) return;
        input.value = "";
        sendAIMessage(message);
    });
    document.getElementById("aiHistorySearch").addEventListener("input", renderAIChat);
}

function renderAIChat() {
    const rawContext = contextProvider?.();
    if (!rawContext?.companyId) return;

    const context = loadContext(rawContext);
    const query = document.getElementById("aiHistorySearch")?.value || "";
    const messages = query
        ? searchConversation(context.companyId, context.user.id, query)
        : loadConversation(context.companyId, context.user.id);
    const suggestions = getSuggestions(context);
    pendingAction = pendingAction || loadPendingAction(context);

    document.getElementById("aiContextLabel").textContent = `${context.company?.name || "Заведение"} • ${context.currentView}`;
    document.getElementById("aiMessages").innerHTML = messages.length ? messages.map((message) => `
        <article class="ai-message ai-message--${message.role}">
            <strong>${message.role === "user" ? "Вы" : "AI Assistant"}</strong>
            <p>${escapeHtml(message.content)}</p>
        </article>
    `).join("") : `
        <article class="ai-message ai-message--assistant">
            <strong>AI Assistant</strong>
            <p>Привет! Я вижу текущий раздел и данные заведения. Задайте вопрос или выберите быструю команду.</p>
        </article>
    `;
    if (pendingAction) {
        document.getElementById("aiMessages").innerHTML += `
            <article class="ai-message ai-message--pending">
                <strong>Ожидается подтверждение</strong>
                <p>${escapeHtml(pendingAction.description || pendingAction.type)}. Напишите «подтверждаю», чтобы выполнить действие.</p>
            </article>
        `;
    }
    if (isSending) {
        document.getElementById("aiMessages").innerHTML += `
            <article class="ai-message ai-message--assistant ai-message--loading">
                <strong>AI Assistant</strong>
                <p>Думаю над ответом...</p>
            </article>
        `;
    }
    document.getElementById("aiQuickActions").innerHTML = `
        <div class="ai-quick-group">
            <span>Частые действия</span>
            ${AI_QUICK_ACTIONS.map((item) => `<button type="button" data-ai-prompt="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join("")}
        </div>
        <div class="ai-quick-group">
            <span>Подсказки для раздела</span>
            ${suggestions.map((item) => `<button type="button" data-ai-prompt="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join("")}
        </div>
    `;
    document.querySelectorAll("[data-ai-prompt]").forEach((button) => {
        button.addEventListener("click", () => sendAIMessage(button.dataset.aiPrompt));
    });
    document.getElementById("aiMessageInput").disabled = isSending;
    document.querySelector("#aiChatForm button").disabled = isSending;
    document.getElementById("aiMessages").scrollTop = document.getElementById("aiMessages").scrollHeight;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

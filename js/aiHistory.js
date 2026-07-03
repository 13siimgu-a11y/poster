import { storage, STORAGE_KEYS } from "./storage.js";

export function loadConversation(companyId, userId) {
    return storage.get(STORAGE_KEYS.aiConversations, []).filter((message) => (
        Number(message.companyId) === Number(companyId)
        && Number(message.userId) === Number(userId)
    ));
}

export function saveConversation(companyId, userId, message) {
    const messages = storage.get(STORAGE_KEYS.aiConversations, []);
    const entry = {
        id: messages.length ? Math.max(...messages.map((item) => Number(item.id))) + 1 : 1,
        companyId: Number(companyId),
        userId: Number(userId),
        ...message,
        createdAt: new Date().toISOString(),
    };

    storage.set(STORAGE_KEYS.aiConversations, [...messages, entry]);
    return entry;
}

export function searchConversation(companyId, userId, query) {
    const normalized = query.trim().toLowerCase();
    return loadConversation(companyId, userId).filter((message) => (
        message.content.toLowerCase().includes(normalized)
    ));
}

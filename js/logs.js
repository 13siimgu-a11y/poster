import { storage, STORAGE_KEYS } from "./storage.js";

export function loadLogs() {
    return storage.get(STORAGE_KEYS.logs, []);
}

export function createLog(action, details = {}) {
    const logs = loadLogs();
    const log = {
        id: logs.length ? Math.max(...logs.map((item) => item.id)) + 1 : 1,
        action,
        details,
        createdAt: new Date().toISOString(),
    };

    logs.unshift(log);
    storage.set(STORAGE_KEYS.logs, logs.slice(0, 300));
    return log;
}

import { createLog } from "./logs.js";
import { storage, STORAGE_KEYS } from "./storage.js";

export const TABLE_STATUSES = {
    free: { label: "Свободен", color: "#16A34A", icon: "🟢" },
    occupied: { label: "Занят", color: "#F59E0B", icon: "🟡" },
    reserved: { label: "Забронирован", color: "#3B82F6", icon: "🔵" },
    payment: { label: "Ожидает оплату", color: "#F97316", icon: "🟠" },
    cleaning: { label: "Требует уборки", color: "#DC2626", icon: "🔴" },
    disabled: { label: "Не используется", color: "#111827", icon: "⚫" },
};

export function loadTables(companyId = null, hallId = null) {
    const tables = storage.get(STORAGE_KEYS.tables, []);
    return tables.filter((table) => (
        (!companyId || Number(table.companyId) === Number(companyId))
        && (!hallId || Number(table.hallId) === Number(hallId))
    ));
}

export function saveTables(tables) {
    return storage.set(STORAGE_KEYS.tables, tables);
}

export function createTable(companyId, hallId, data = {}) {
    const tables = storage.get(STORAGE_KEYS.tables, []);
    const now = new Date().toISOString();
    const table = {
        id: tables.length ? Math.max(...tables.map((item) => Number(item.id))) + 1 : 1,
        companyId: Number(companyId),
        hallId: Number(hallId),
        name: data.name || `Стол №${loadTables(companyId, hallId).length + 1}`,
        seats: Number(data.seats || 4),
        deposit: Number(data.deposit || 0),
        comment: data.comment || "",
        status: data.status || "free",
        type: data.type || "round",
        x: Number(data.x || 80),
        y: Number(data.y || 80),
        width: Number(data.width || 120),
        height: Number(data.height || 120),
        rotation: Number(data.rotation || 0),
        color: data.color || "#3B82F6",
        activeOrderId: data.activeOrderId || null,
        reservationId: data.reservationId || null,
        createdAt: now,
        updatedAt: now,
    };

    saveTables([...tables, table]);
    createLog("Создал стол", { companyId, hallId, table: table.name });
    return table;
}

export function updateTable(tableId, data) {
    const tables = storage.get(STORAGE_KEYS.tables, []);
    const tableIndex = tables.findIndex((table) => Number(table.id) === Number(tableId));

    if (tableIndex === -1) {
        return null;
    }

    tables[tableIndex] = {
        ...tables[tableIndex],
        ...data,
        updatedAt: new Date().toISOString(),
    };

    saveTables(tables);
    return tables[tableIndex];
}

export function deleteTable(tableId) {
    const tables = storage.get(STORAGE_KEYS.tables, []);
    const table = tables.find((item) => Number(item.id) === Number(tableId));

    if (!table) {
        return false;
    }

    saveTables(tables.filter((item) => Number(item.id) !== Number(tableId)));
    createLog("Удалил стол", { companyId: table.companyId, table: table.name });
    return true;
}

export function moveTable(tableId, x, y) {
    return updateTable(tableId, { x: Number(x), y: Number(y) });
}

export function rotateTable(tableId, rotation) {
    return updateTable(tableId, { rotation: Number(rotation) });
}

export function resizeTable(tableId, width, height) {
    return updateTable(tableId, { width: Number(width), height: Number(height) });
}

export function changeTableStatus(tableId, status) {
    if (!TABLE_STATUSES[status]) {
        return null;
    }

    return updateTable(tableId, { status });
}

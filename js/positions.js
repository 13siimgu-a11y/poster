import { createLog } from "./logs.js";
import { storage, STORAGE_KEYS } from "./storage.js";

export const DEFAULT_POSITIONS = [
    "Владелец",
    "Администратор",
    "Менеджер",
    "Кассир",
    "Официант",
    "Бармен",
    "Повар",
    "Су-шеф",
    "Шеф-повар",
    "Уборщик",
    "Курьер",
    "Бухгалтер",
];

export function loadPositions(companyId = null) {
    const positions = storage.get(STORAGE_KEYS.positions, []);
    return companyId ? positions.filter((position) => Number(position.companyId) === Number(companyId)) : positions;
}

export function ensureDefaultPositions(companyId) {
    const existing = loadPositions(companyId);
    if (existing.length) return existing;

    const positions = storage.get(STORAGE_KEYS.positions, []);
    const nextId = positions.length ? Math.max(...positions.map((item) => Number(item.id))) + 1 : 1;
    const defaults = DEFAULT_POSITIONS.map((name, index) => ({
        id: nextId + index,
        companyId: Number(companyId),
        name,
        description: "",
        active: true,
        archived: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    }));

    storage.set(STORAGE_KEYS.positions, [...positions, ...defaults]);
    return defaults;
}

export function createPosition(companyId, data) {
    const positions = storage.get(STORAGE_KEYS.positions, []);
    const position = {
        id: positions.length ? Math.max(...positions.map((item) => Number(item.id))) + 1 : 1,
        companyId: Number(companyId),
        name: data.name.trim(),
        description: data.description || "",
        active: data.active !== false,
        archived: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    storage.set(STORAGE_KEYS.positions, [...positions, position]);
    createLog("Создал должность", { companyId, position: position.name });
    return position;
}

export function updatePosition(positionId, data) {
    const positions = storage.get(STORAGE_KEYS.positions, []);
    const index = positions.findIndex((position) => Number(position.id) === Number(positionId));
    if (index === -1) return null;

    positions[index] = {
        ...positions[index],
        ...data,
        name: data.name?.trim() || positions[index].name,
        updatedAt: new Date().toISOString(),
    };
    storage.set(STORAGE_KEYS.positions, positions);
    return positions[index];
}

export function deletePosition(positionId) {
    storage.set(STORAGE_KEYS.positions, storage.get(STORAGE_KEYS.positions, []).filter((position) => Number(position.id) !== Number(positionId)));
}

export function archivePosition(positionId) {
    return updatePosition(positionId, { archived: true, active: false });
}

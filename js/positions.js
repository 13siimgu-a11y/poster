import { createLog } from "./logs.js";
import { idsEqual, mirrorCreate, mirrorDelete, mirrorUpdate } from "./apiPersistence.js";
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
    return companyId ? positions.filter((position) => idsEqual(position.companyId, companyId)) : positions;
}

export function ensureDefaultPositions(companyId) {
    const existing = loadPositions(companyId);
    if (existing.length) return existing;

    const positions = storage.get(STORAGE_KEYS.positions, []);
    const nextId = positions.length ? Math.max(...positions.map((item) => Number(item.id))) + 1 : 1;
    const defaults = DEFAULT_POSITIONS.map((name, index) => ({
        id: nextId + index,
        companyId,
        name,
        description: "",
        active: true,
        archived: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    }));

    storage.set(STORAGE_KEYS.positions, [...positions, ...defaults]);
    defaults.forEach((position) => mirrorCreate("positions", companyId, position));
    return defaults;
}

export function createPosition(companyId, data) {
    const positions = storage.get(STORAGE_KEYS.positions, []);
    const position = {
        id: positions.length ? Math.max(...positions.map((item) => Number(item.id))) + 1 : 1,
        companyId,
        name: data.name.trim(),
        description: data.description || "",
        active: data.active !== false,
        archived: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    storage.set(STORAGE_KEYS.positions, [...positions, position]);
    mirrorCreate("positions", companyId, position);
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
    mirrorUpdate("positions", positions[index].companyId, positions[index]);
    return positions[index];
}

export function deletePosition(positionId) {
    const positions = storage.get(STORAGE_KEYS.positions, []);
    const position = positions.find((item) => Number(item.id) === Number(positionId));
    storage.set(STORAGE_KEYS.positions, positions.filter((item) => Number(item.id) !== Number(positionId)));
    if (position) {
        mirrorDelete("positions", position.companyId, position);
    }
}

export function archivePosition(positionId) {
    return updatePosition(positionId, { archived: true, active: false });
}

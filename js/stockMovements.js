import { idsEqual } from "./apiPersistence.js";
import { storage, STORAGE_KEYS } from "./storage.js";

export function loadStockMovements(companyId = null) {
    const movements = storage.get(STORAGE_KEYS.stockMovements, []);
    return companyId ? movements.filter((movement) => idsEqual(movement.companyId, companyId)) : movements;
}

export function logStockMovement(companyId, ingredientId, data) {
    const movements = storage.get(STORAGE_KEYS.stockMovements, []);
    const movement = {
        id: movements.length ? Math.max(...movements.map((item) => Number(item.id))) + 1 : 1,
        companyId,
        ingredientId,
        type: data.type,
        quantity: Number(data.quantity),
        reason: data.reason || "",
        userId: Number(data.userId || 0),
        balanceAfter: Number(data.balanceAfter || 0),
        createdAt: new Date().toISOString(),
    };

    storage.set(STORAGE_KEYS.stockMovements, [movement, ...movements]);
    return movement;
}

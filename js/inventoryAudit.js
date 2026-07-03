import { loadIngredients, updateIngredient } from "./ingredients.js";
import { logStockMovement } from "./stockMovements.js";
import { storage, STORAGE_KEYS } from "./storage.js";

export function performInventory(companyId, ingredientId, actualQuantity, userId = 0) {
    const audits = storage.get(STORAGE_KEYS.inventoryAudits, []);
    const ingredient = loadIngredients(companyId).find((item) => Number(item.id) === Number(ingredientId));

    if (!ingredient) {
        return null;
    }

    const difference = Number(actualQuantity) - Number(ingredient.quantity);
    const updated = updateIngredient(ingredientId, { quantity: Number(actualQuantity) });
    const audit = {
        id: audits.length ? Math.max(...audits.map((item) => Number(item.id))) + 1 : 1,
        companyId: Number(companyId),
        ingredientId: Number(ingredientId),
        expectedQuantity: ingredient.quantity,
        actualQuantity: Number(actualQuantity),
        difference,
        userId: Number(userId),
        createdAt: new Date().toISOString(),
    };

    storage.set(STORAGE_KEYS.inventoryAudits, [audit, ...audits]);
    logStockMovement(companyId, ingredientId, {
        type: "inventory",
        quantity: difference,
        reason: "Инвентаризация",
        userId,
        balanceAfter: updated.quantity,
    });
    return audit;
}

export function loadInventoryAudits(companyId = null) {
    const audits = storage.get(STORAGE_KEYS.inventoryAudits, []);
    return companyId ? audits.filter((audit) => Number(audit.companyId) === Number(companyId)) : audits;
}

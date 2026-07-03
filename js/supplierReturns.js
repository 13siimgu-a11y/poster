import { writeOffStock } from "./ingredients.js";
import { storage, STORAGE_KEYS } from "./storage.js";

export const RETURN_REASONS = ["Брак", "Истекший срок годности", "Ошибка поставки", "Излишек", "Другое"];

export function loadSupplierReturns(companyId = null) {
    const returns = storage.get(STORAGE_KEYS.supplierReturns, []);
    return companyId ? returns.filter((item) => Number(item.companyId) === Number(companyId)) : returns;
}

export function returnGoods(companyId, supplierId, items, reason, userId = 0) {
    const returns = storage.get(STORAGE_KEYS.supplierReturns, []);
    const entry = {
        id: returns.length ? Math.max(...returns.map((item) => Number(item.id))) + 1 : 1,
        companyId: Number(companyId),
        supplierId: Number(supplierId),
        items,
        reason,
        userId: Number(userId),
        createdAt: new Date().toISOString(),
    };

    items.forEach((item) => {
        writeOffStock(item.ingredientId, item.quantity, `Возврат поставщику: ${reason}`, userId);
    });

    storage.set(STORAGE_KEYS.supplierReturns, [entry, ...returns]);
    return entry;
}

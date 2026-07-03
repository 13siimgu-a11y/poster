import { createLog } from "./logs.js";
import { idsEqual, mirrorCreate, mirrorDelete, mirrorUpdate } from "./apiPersistence.js";
import { logStockMovement } from "./stockMovements.js";
import { storage, STORAGE_KEYS } from "./storage.js";

export const INGREDIENT_CATEGORIES = [
    "Мясо",
    "Рыба",
    "Морепродукты",
    "Овощи",
    "Фрукты",
    "Молочные продукты",
    "Соусы",
    "Специи",
    "Напитки",
    "Алкоголь",
    "Выпечка",
    "Заморозка",
    "Полуфабрикаты",
    "Прочее",
];

export function loadIngredients(companyId = null) {
    const ingredients = storage.get(STORAGE_KEYS.ingredients, []);
    return companyId ? ingredients.filter((item) => idsEqual(item.companyId, companyId)) : ingredients;
}

export function saveIngredients(ingredients) {
    return storage.set(STORAGE_KEYS.ingredients, ingredients);
}

export function generateIngredientSku(companyId) {
    return `ING-${String(loadIngredients(companyId).length + 1).padStart(4, "0")}`;
}

export function createIngredient(companyId, data) {
    const ingredients = storage.get(STORAGE_KEYS.ingredients, []);
    const now = new Date().toISOString();
    const ingredient = {
        id: ingredients.length ? Math.max(...ingredients.map((item) => Number(item.id))) + 1 : 1,
        companyId,
        name: data.name.trim(),
        sku: data.sku || generateIngredientSku(companyId),
        barcode: data.barcode || "",
        category: data.category || "Прочее",
        description: data.description || "",
        unit: data.unit || "g",
        quantity: Number(data.quantity || 0),
        minQuantity: Number(data.minQuantity || 0),
        maxQuantity: Number(data.maxQuantity || 0),
        costPrice: Number(data.costPrice || 0),
        supplier: data.supplier || "",
        active: data.active !== false,
        createdAt: now,
        updatedAt: now,
    };

    saveIngredients([...ingredients, ingredient]);
    mirrorCreate("ingredients", companyId, ingredient);
    logStockMovement(companyId, ingredient.id, {
        type: "income",
        quantity: ingredient.quantity,
        reason: "Начальный остаток",
        userId: data.userId,
        balanceAfter: ingredient.quantity,
    });
    createLog("Создал ингредиент", { companyId, ingredient: ingredient.name });
    return ingredient;
}

export function updateIngredient(ingredientId, data) {
    const ingredients = storage.get(STORAGE_KEYS.ingredients, []);
    const index = ingredients.findIndex((item) => Number(item.id) === Number(ingredientId));

    if (index === -1) {
        return null;
    }

    ingredients[index] = {
        ...ingredients[index],
        ...data,
        name: data.name?.trim() || ingredients[index].name,
        quantity: data.quantity !== undefined ? Number(data.quantity) : ingredients[index].quantity,
        minQuantity: data.minQuantity !== undefined ? Number(data.minQuantity) : ingredients[index].minQuantity,
        maxQuantity: data.maxQuantity !== undefined ? Number(data.maxQuantity) : ingredients[index].maxQuantity,
        costPrice: data.costPrice !== undefined ? Number(data.costPrice) : ingredients[index].costPrice,
        updatedAt: new Date().toISOString(),
    };

    saveIngredients(ingredients);
    mirrorUpdate("ingredients", ingredients[index].companyId, ingredients[index]);
    return ingredients[index];
}

export function deleteIngredient(ingredientId) {
    const ingredients = storage.get(STORAGE_KEYS.ingredients, []);
    const ingredient = ingredients.find((item) => Number(item.id) === Number(ingredientId));

    if (!ingredient) {
        return false;
    }

    saveIngredients(ingredients.filter((item) => Number(item.id) !== Number(ingredientId)));
    mirrorDelete("ingredients", ingredient.companyId, ingredient);
    createLog("Удалил ингредиент", { companyId: ingredient.companyId, ingredient: ingredient.name });
    return true;
}

export function addStock(ingredientId, quantity, reason = "Приход", userId = 0) {
    const ingredient = loadIngredients().find((item) => Number(item.id) === Number(ingredientId));

    if (!ingredient) {
        return null;
    }

    const updated = updateIngredient(ingredientId, { quantity: ingredient.quantity + Number(quantity) });
    logStockMovement(updated.companyId, updated.id, {
        type: "income",
        quantity,
        reason,
        userId,
        balanceAfter: updated.quantity,
    });
    return updated;
}

export function writeOffStock(ingredientId, quantity, reason = "Списание", userId = 0) {
    const ingredient = loadIngredients().find((item) => Number(item.id) === Number(ingredientId));

    if (!ingredient) {
        return null;
    }

    const updated = updateIngredient(ingredientId, { quantity: Math.max(0, ingredient.quantity - Number(quantity)) });
    logStockMovement(updated.companyId, updated.id, {
        type: "writeoff",
        quantity: -Math.abs(Number(quantity)),
        reason,
        userId,
        balanceAfter: updated.quantity,
    });
    return updated;
}
